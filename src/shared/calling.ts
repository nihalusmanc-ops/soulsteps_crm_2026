import { dubaiDay, salesCallTaskTypes, type Enquiry } from "./domain";

export const callColours = {
  orange: "Hot",
  yellow: "Warm · itinerary sent",
  purple: "Considering",
  pink: "Call back · busy",
  cyan: "No answer",
  blue: "Repeated no answer",
  red: "Disqualified",
} as const;
export type CallColour = keyof typeof callColours;
export const colourOrder = Object.keys(callColours) as CallColour[];
export const groupLabels = {
  couple: "Couple",
  solo: "Solo",
  family: "Family",
  friends: "Friends",
  unknown: "Not set",
};
export const followupTask = (e: Enquiry) =>
  e.tasks
    .filter(
      (t) => t.status === "pending" && salesCallTaskTypes.includes(t.type),
    )
    .sort((a, b) => a.due.localeCompare(b.due))[0];
export const localDue = (due?: string) =>
  due ? new Date(Date.parse(due) + 4 * 3600000).toISOString().slice(0, 16) : "";
export function receivedAgeLabel(received: string, now = new Date()) {
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(dubaiDay(now)) - Date.parse(dubaiDay(new Date(received)))) /
        86400000,
    ),
  );
  return days ? `${days}d ago` : "today";
}
export function enquiryStatus(e: Enquiry) {
  if (leadColour(e) === "green") return "deposit";
  if (
    e.callColour === "red" ||
    e.stage === "LOST" ||
    e.stage === "NOT_SUITABLE"
  )
    return "disqualified";
  if (callingList(e) === "closed") return "closed";
  return callingList(e);
}
export function dueMatches(e: Enquiry, filter: string, now = new Date()) {
  if (!filter) return true;
  if (callingList(e) === "closed") return false;
  const due = followupTask(e)?.due;
  if (filter === "unscheduled") return !due;
  if (!due) return false;
  if (filter === "overdue") return Date.parse(due) < now.getTime();
  if (filter === "today") return dubaiDay(new Date(due)) === dubaiDay(now);
  if (filter === "upcoming") return dubaiDay(new Date(due)) > dubaiDay(now);
  return dubaiDay(new Date(due)) <= dubaiDay(now);
}
export function followupLabel(due: string | undefined, now = new Date()) {
  if (!due) return "Not scheduled";
  const date = new Date(due),
    day = dubaiDay(date),
    today = dubaiDay(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  if (day === today)
    return `Today, ${time}${date.getTime() < now.getTime() ? " · overdue" : ""}`;
  if (day < today) {
    const days = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
    return `${days} ${days === 1 ? "day" : "days"} overdue`;
  }
  if (day === dubaiDay(new Date(now.getTime() + 86400000)))
    return `Tomorrow, ${time}`;
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" }).format(date)}, ${time}`;
}
export function compareColumn(
  a: Enquiry,
  b: Enquiry,
  column: string,
  direction: string,
) {
  const value = (e: Enquiry) =>
    column === "customer"
      ? e.name
      : column === "priority"
        ? e.rank || "P0"
        : column === "received"
          ? e.createdAt
          : column === "note"
            ? currentNote(e)
            : followupTask(e)?.due || "z";
  const colours = [...colourOrder, "green", "none"] as const;
  const diff =
    column === "colour"
      ? colours.indexOf(leadColour(a)) - colours.indexOf(leadColour(b))
      : value(a).localeCompare(value(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return diff * (direction === "desc" ? -1 : 1) || a.id.localeCompare(b.id);
}
export function leadColour(e: Enquiry): CallColour | "green" | "none" {
  if (e.payments.some((p) => p.status !== "reversed" && p.amount > 0))
    return "green";
  return e.callColour || "none";
}
export const initialCallDone = (e: Enquiry) =>
  !!(
    e.initialCallAt ||
    e.lastContact ||
    e.activities.some((a) => a.type === "call")
  );
export const callingList = (e: Enquiry) => {
  const colour = leadColour(e);
  if (
    colour === "red" ||
    colour === "green" ||
    ["CONFIRMED", "LOST", "NOT_SUITABLE", "ON_HOLD"].includes(e.stage)
  )
    return "closed";
  return initialCallDone(e) ? "followups" : "new";
};
export const currentNote = (e: Enquiry) =>
  e.currentNote ??
  e.activities.find((a) => a.type === "note")?.text ??
  e.workbook?.latestNote ??
  "";
export function compareCalling(a: Enquiry, b: Enquiry, followups: boolean) {
  if (followups) {
    const index = (e: Enquiry) => {
      const i = colourOrder.indexOf(leadColour(e) as CallColour);
      return i < 0 ? colourOrder.length : i;
    };
    const diff = index(a) - index(b);
    if (diff) return diff;
    const due = (e: Enquiry) =>
      e.tasks
        .filter((t) => t.status === "pending")
        .map((t) => t.due)
        .sort()[0] || "z";
    return (
      due(a).localeCompare(due(b)) ||
      (a.lastContact || a.createdAt).localeCompare(b.lastContact || b.createdAt)
    );
  }
  return (
    (a.rank || "P0").localeCompare(b.rank || "P0") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}
