import type { Rule } from "./management";
import type { WorkbookContext } from "./workbook-context";
import { z } from "zod";
import type { CallColour } from "./calling";
export const stages = {
  NEW: "New enquiry",
  QUALIFYING: "Initial discussion",
  INTERESTED: "Interested",
  PROPOSAL_SENT: "Proposal sent",
  DECISION_PENDING: "Decision pending",
  AWAITING_DEPOSIT: "Awaiting deposit",
  CONFIRMED: "Booking confirmed",
  ON_HOLD: "On hold",
  LOST: "Lost",
  NOT_SUITABLE: "Not suitable",
} as const;
export type Stage = keyof typeof stages;
export type Temperature = "hot" | "warm" | "cold" | "unassessed";
export type Group = "couple" | "solo" | "family" | "friends" | "unknown";
export type Visa = "all" | "none" | "some" | "unknown";
export type Rank = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type Activity = {
  id: string;
  type: string;
  text: string;
  at: string;
  actor: string;
};
export type Task = {
  id: string;
  type: string;
  due: string;
  status: "pending" | "completed" | "cancelled";
  note: string;
};
export type Payment = {
  id: string;
  amount: number;
  currency: "AED";
  date: string;
  reference: string;
  status: "pending" | "verified" | "reversed";
  recordedAt?: string;
  recordedBy?: string;
  verifiedAt?: string;
  verifier?: string;
  reversalReason?: string;
  reversedBy?: string;
  reversedAt?: string;
};
export type Quote = {
  id: string;
  total: number;
  deposit: number | null;
  currency: "AED";
  accepted: boolean;
  terms: string;
  issuedAt: string;
};
export type Enquiry = {
  id: string;
  customerId: string;
  ownerId?: string;
  shared?: boolean;
  sourceSections?: string[];
  sourceForms?: string[];
  workbook?: WorkbookContext;
  name: string;
  email: string;
  phone: string | null;
  tripId: string;
  stage: Stage;
  temperature: Temperature;
  group: Group;
  visa: Visa;
  travellers: number | null;
  selfDrive?: "yes" | "no" | "unknown";
  desiredDeparture?: string;
  bookingTimeframe?: string;
  rank: Rank | null;
  rankReason: string;
  rankRuleVersion?: number;
  rankComputedAt?: string;
  override?: { rank: Rank; reason: string; actor?: string; at?: string };
  response: string;
  owner: string;
  source: string;
  createdAt: string;
  lastContact?: string;
  initialCallAt?: string;
  callColour?: CallColour;
  currentNote?: string;
  sample?: boolean;
  originalNote: string;
  originalGroup: string;
  requestedCallback?: string;
  holdReason?: string;
  availability: "pending" | "confirmed" | "unavailable";
  tasks: Task[];
  activities: Activity[];
  payments: Payment[];
  quote?: Quote;
  booking?: { reference: string; confirmedAt: string; actor: string };
  revision: number;
};
export type Trip = {
  id: string;
  name: string;
  destination: string;
  status: "draft" | "published" | "inactive";
  description: string;
  type: "fixed" | "bespoke";
  departure: string;
  availabilityNote: string;
  itinerary: string;
  price: number | null;
  deposit: number | null;
  version: number;
  groupVisaPolicy: "review" | "P3" | "P6";
  activeRuleVersion?: number;
  activeRules?: Rule[];
  activeContentVersion?: number;
  publishedAt?: string;
};
export type State = { version: 1; enquiries: Enquiry[]; trips: Trip[] };
export function selfDrivePreference(e: Enquiry): "yes" | "no" | "unknown" {
  if (e.selfDrive) return e.selfDrive;
  const answers = [
    ...new Set(
      Array.from(
        e.originalNote.matchAll(
          /do_you_want_self_drive_option\?\s*:\s*(yes|no)\b/gi,
        ),
        (m) => m[1].toLowerCase(),
      ),
    ),
  ];
  return answers.length === 1 ? (answers[0] as "yes" | "no") : "unknown";
}
export const money = (amount: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(amount / 100);
export const dubaiDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function classify(
  group: Group,
  visa: Visa,
  _policy: Trip["groupVisaPolicy"] = "review",
): { rank: Rank | null; reason: string } {
  if (group === "unknown" || visa === "unknown" || visa === "some")
    return {
      rank: null,
      reason: "Needs qualification: confirm travel group and Schengen answer.",
    };
  const rank: Rank =
    group === "couple"
      ? visa === "all"
        ? "P1"
        : "P2"
      : group === "solo"
        ? visa === "all"
          ? "P3"
          : "P5"
        : visa === "all"
          ? "P4"
          : "P6";
  return {
    rank,
    reason:
      (group === "friends" || group === "family"
        ? "Family / small group"
        : group) +
      " / Schengen: " +
      (visa === "all" ? "Yes" : "No"),
  };
}
// Existing storage statuses are retained. Every saved manual payment counts;
// a separate bank-verification action is no longer required.
export const receivedTotal = (e: Enquiry) =>
  e.payments
    .filter(
      (p) =>
        p.status !== "reversed" && p.currency === (e.quote?.currency || "AED"),
    )
    .reduce((s, p) => s + p.amount, 0);
// Compatibility for historical callers; new screens use receivedTotal.
export const verifiedTotal = receivedTotal;
export function confirmationBlock(e: Enquiry): string | null {
  if (e.booking) return null;
  if (!e.quote?.accepted || e.quote.total <= 0)
    return "Record an accepted quotation with a valid booking amount.";
  if (e.quote.deposit === null || e.quote.deposit <= 0)
    return "A positive required deposit must be defined. Zero-deposit terms need policy review.";
  if (e.quote.deposit > e.quote.total)
    return "Deposit cannot exceed the booking amount.";
  const paid = receivedTotal(e);
  if (paid > e.quote.total)
    return "Overpayment requires review before confirmation.";
  if (paid < e.quote.deposit)
    return `${money(e.quote.deposit - paid)} of the required deposit remains unpaid.`;
  return null;
}
export const isOpen = (e: Enquiry) =>
  !["CONFIRMED", "LOST", "NOT_SUITABLE", "ON_HOLD"].includes(e.stage);
export const nextTask = (e: Enquiry) =>
  e.tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.due.localeCompare(b.due))[0];
const text = z.string().trim().min(1).max(4000);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("saveCall"),
    colour: z.enum([
      "orange",
      "yellow",
      "purple",
      "pink",
      "cyan",
      "blue",
      "red",
    ]),
    note: text,
    followup: z.string().optional(),
  }),
  z.object({ type: z.literal("note"), text }),
  z.object({
    type: z.literal("call"),
    outcome: z.enum([
      "Connected",
      "No answer",
      "Busy",
      "Unreachable",
      "Callback requested",
      "Not interested",
    ]),
    note: z.string().max(4000),
    taskId: z.string().optional(),
    followup: z.string().optional(),
    noNextReason: z.string().optional(),
  }),
  z.object({
    type: z.literal("task"),
    due: text,
    kind: text,
    note: z.string().max(4000),
    replaces: z.string().optional(),
  }),
  z.object({
    type: z.literal("taskStatus"),
    taskId: text,
    status: z.enum(["completed", "cancelled"]),
    reason: text,
  }),
  z.object({
    type: z.literal("stage"),
    stage: z.enum(Object.keys(stages) as [Stage, ...Stage[]]),
    reason: z.string().max(4000),
  }),
  z.object({
    type: z.literal("qualify"),
    group: z.enum(["couple", "solo", "family", "friends", "unknown"]),
    visa: z.enum(["all", "none", "some", "unknown"]),
    temperature: z.enum(["hot", "warm", "cold", "unassessed"]),
    availability: z.enum(["pending", "confirmed", "unavailable"]),
    name: z.string().trim().min(1).max(100).optional(),
    email: z.union([z.email().max(254), z.literal("")]).optional(),
    phone: z
      .union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.literal("")])
      .optional(),
    travellers: z.number().int().min(1).max(1000).nullable().optional(),
    selfDrive: z.enum(["yes", "no", "unknown"]).optional(),
    desiredDeparture: z
      .string()
      .refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "Choose a valid date.",
      )
      .optional(),
    bookingTimeframe: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal("payment"),
    amount: z.number().int().positive().max(100000000),
    date: text,
    reference: text,
  }),
  z.object({ type: z.literal("verify"), paymentId: text }),
  z.object({ type: z.literal("reverse"), paymentId: text, reason: text }),
  z.object({
    type: z.literal("quote"),
    total: z.number().int().positive(),
    deposit: z.number().int().positive(),
    terms: text,
  }),
  z.object({ type: z.literal("confirm") }),
  z.object({
    type: z.literal("override"),
    rank: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
    reason: text,
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function applyCommand(
  input: Enquiry,
  raw: Command,
  policy: Trip["groupVisaPolicy"] = "review",
  context: { actor: string; demo: boolean } = {
    actor: "Demo staff",
    demo: true,
  },
): Enquiry {
  const cmd = commandSchema.parse(raw);
  const e = structuredClone(input);
  const now = new Date().toISOString();
  const activity = (type: string, text: string) =>
    e.activities.unshift({
      id: crypto.randomUUID(),
      type,
      text,
      at: now,
      actor: context.actor,
    });
  const dueDate = (value: string) => {
    if (!Number.isFinite(Date.parse(value)))
      throw new Error("Choose a valid date and time.");
    return new Date(value).toISOString();
  };
  const addTask = (due: string, type: string, note: string) => {
    e.tasks.push({
      id: crypto.randomUUID(),
      type,
      due: dueDate(due),
      status: "pending",
      note,
    });
    activity("task", `${type} scheduled for ${dateTime(due)} (Dubai). ${note}`);
  };
  switch (cmd.type) {
    case "saveCall": {
      if (
        e.booking ||
        e.payments.some((p) => p.status !== "reversed" && p.amount > 0)
      )
        throw new Error(
          "This enquiry has a deposit or booking. Update its note from the profile.",
        );
      if (cmd.colour === "red" && cmd.followup)
        throw new Error(
          "Disqualified enquiries cannot have a sales follow-up.",
        );
      if (cmd.followup) dueDate(cmd.followup);
      e.initialCallAt ||= now;
      e.lastContact = now;
      e.callColour = cmd.colour;
      e.currentNote = cmd.note;
      e.temperature =
        cmd.colour === "orange"
          ? "hot"
          : cmd.colour === "yellow"
            ? "warm"
            : "cold";
      e.response = ["cyan", "blue"].includes(cmd.colour) ? "no_answer" : "none";
      if (cmd.colour === "red") e.stage = "LOST";
      else if (["NEW", "LOST", "NOT_SUITABLE", "ON_HOLD"].includes(e.stage))
        e.stage = "QUALIFYING";
      e.tasks
        .filter((t) => t.status === "pending")
        .forEach((t) => {
          t.status = cmd.colour === "red" ? "cancelled" : "completed";
        });
      activity("call", `${cmd.colour}: ${cmd.note}`);
      activity("note", cmd.note);
      if (cmd.followup) addTask(cmd.followup, "Follow-up", cmd.note);
      break;
    }
    case "note":
      e.currentNote = cmd.text;
      activity("note", cmd.text);
      break;
    case "call":
      if (!cmd.followup && !cmd.noNextReason?.trim())
        throw new Error(
          "Schedule a follow-up or explain why no next action is needed.",
        );
      if (cmd.taskId) {
        const t = e.tasks.find(
          (t) => t.id === cmd.taskId && t.status === "pending",
        );
        if (!t) throw new Error("This task is no longer pending.");
        t.status = "completed";
      }
      e.lastContact = now;
      e.initialCallAt ||= now;
      if (cmd.note.trim()) {
        e.currentNote = cmd.note;
        activity("note", cmd.note);
      }
      e.response =
        cmd.outcome === "No answer"
          ? "no_answer"
          : cmd.outcome === "Unreachable"
            ? "unreachable"
            : cmd.outcome === "Connected"
              ? "none"
              : e.response;
      activity(
        "call",
        `${cmd.outcome}. ${cmd.note}${cmd.noNextReason ? ` No next action: ${cmd.noNextReason}` : ""}`,
      );
      if (cmd.followup) addTask(cmd.followup, "Follow-up", cmd.note);
      break;
    case "task":
      if (cmd.replaces) {
        const old = e.tasks.find(
          (t) => t.id === cmd.replaces && t.status === "pending",
        );
        if (!old) throw new Error("Task is no longer pending.");
        old.status = "cancelled";
        activity(
          "task",
          `Rescheduled ${old.type}; original due time ${dateTime(old.due)} retained.`,
        );
      }
      addTask(cmd.due, cmd.kind, cmd.note);
      break;
    case "taskStatus": {
      const t = e.tasks.find(
        (t) => t.id === cmd.taskId && t.status === "pending",
      );
      if (!t) throw new Error("Task is no longer pending.");
      t.status = cmd.status;
      activity("task", `${t.type} ${cmd.status}: ${cmd.reason}`);
      break;
    }
    case "stage":
      if (cmd.stage === "CONFIRMED")
        throw new Error("Use the deposit and booking confirmation flow.");
      if (e.booking)
        throw new Error(
          "Booking cancellation/reopening requires a policy review.",
        );
      if (
        ["LOST", "NOT_SUITABLE", "ON_HOLD"].includes(cmd.stage) &&
        !cmd.reason.trim()
      )
        throw new Error("A reason is required for this stage.");
      activity(
        "stage",
        `${stages[e.stage]} -> ${stages[cmd.stage]}. ${cmd.reason}`,
      );
      e.stage = cmd.stage;
      e.holdReason = cmd.reason;
      if (["LOST", "NOT_SUITABLE", "ON_HOLD"].includes(cmd.stage))
        e.tasks
          .filter((t) => t.status === "pending")
          .forEach((t) => {
            t.status = "cancelled";
            activity("task", `${t.type} cancelled on stage change.`);
          });
      break;
    case "qualify": {
      e.group = cmd.group;
      e.visa = cmd.visa;
      e.temperature = cmd.temperature;
      e.availability = cmd.availability;
      if (e.group !== input.group)
        e.travellers = e.group === "couple" ? 2 : e.group === "solo" ? 1 : null;
      if (cmd.name !== undefined) e.name = cmd.name;
      if (cmd.email !== undefined) e.email = cmd.email;
      if (cmd.phone !== undefined) e.phone = cmd.phone || null;
      if (cmd.travellers !== undefined) e.travellers = cmd.travellers;
      if (cmd.selfDrive !== undefined) e.selfDrive = cmd.selfDrive;
      if (cmd.desiredDeparture !== undefined)
        e.desiredDeparture = cmd.desiredDeparture;
      if (cmd.bookingTimeframe !== undefined)
        e.bookingTimeframe = cmd.bookingTimeframe;
      const fit = classify(e.group, e.visa, policy);
      if (!e.override) {
        e.rank = fit.rank;
        e.rankReason = fit.reason;
      }
      activity(
        "qualification",
        "Customer details and trip preferences updated. Original notes and offered quotation terms are preserved.",
      );
      break;
    }
    case "payment":
      if (!e.quote) throw new Error("Record quotation terms before a payment.");
      e.payments.push({
        id: crypto.randomUUID(),
        amount: cmd.amount,
        currency: "AED",
        date: dueDate(cmd.date),
        reference: cmd.reference,
        status: "pending",
        recordedAt: now,
        recordedBy: context.actor,
      });
      activity(
        "payment",
        `${money(cmd.amount)} payment recorded. Reference: ${cmd.reference}`,
      );
      e.tasks
        .filter((t) => t.status === "pending")
        .forEach((t) => (t.status = "cancelled"));
      break;
    case "verify": {
      const p = e.payments.find((p) => p.id === cmd.paymentId);
      if (!p || p.status !== "pending")
        throw new Error("Only a pending payment can be verified.");
      p.status = "verified";
      p.verifiedAt = now;
      p.verifier = context.actor;
      activity(
        "payment",
        `${money(p.amount)} verified against ${context.demo ? "fictional " : ""}bank records. Booking confirmation remains a separate action.`,
      );
      break;
    }
    case "reverse": {
      const p = e.payments.find((p) => p.id === cmd.paymentId);
      if (!p || p.status === "reversed")
        throw new Error("Only recorded payments can be reversed.");
      p.status = "reversed";
      p.reversalReason = cmd.reason;
      p.reversedBy = context.actor;
      p.reversedAt = now;
      activity(
        "payment",
        `${money(p.amount)} reversed by ${context.actor}: ${cmd.reason}`,
      );
      break;
    }
    case "quote":
      if (e.quote)
        throw new Error("Accepted quotations cannot be overwritten.");
      if (cmd.deposit > cmd.total)
        throw new Error("Deposit exceeds booking value.");
      e.quote = {
        id: crypto.randomUUID(),
        total: cmd.total,
        deposit: cmd.deposit,
        currency: "AED",
        accepted: true,
        terms: cmd.terms,
        issuedAt: now,
      };
      activity(
        "quote",
        `Accepted ${context.demo ? "fictional " : ""}quote: ${money(cmd.total)}, deposit ${money(cmd.deposit)}. ${cmd.terms}`,
      );
      break;
    case "confirm": {
      if (e.booking) return e;
      const reason = confirmationBlock(e);
      if (reason) throw new Error(reason);
      e.booking = {
        reference: `SS-${e.id}`,
        confirmedAt: now,
        actor: context.actor,
      };
      e.stage = "CONFIRMED";
      e.tasks
        .filter((t) => t.status === "pending")
        .forEach((t) => (t.status = "cancelled"));
      activity(
        "booking",
        `Booking ${e.booking.reference} explicitly confirmed; pending sales tasks cancelled. Inventory is not reserved.`,
      );
      break;
    }
    case "override":
      e.override = {
        rank: cmd.rank,
        reason: cmd.reason,
        actor: context.actor,
        at: now,
      };
      e.rank = cmd.rank;
      e.rankReason = `Manual override: ${cmd.reason}`;
      activity("qualification", `Trip-fit override ${cmd.rank}: ${cmd.reason}`);
      break;
  }
  e.revision++;
  return e;
}
export function manualWhatsAppUrl(phone: string | null): string | null {
  return phone && /^\+[1-9]\d{7,14}$/.test(phone)
    ? `https://wa.me/${phone.slice(1)}`
    : null;
}
