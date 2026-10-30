import {
  applyCommand,
  type Command,
  type State,
  type Trip,
} from "../../shared/domain";
import type { Identity } from "../../shared/api";
import { tripSchema } from "../../shared/api";
import { eligibleForRecompute, evaluateRules } from "../../shared/management";

export type CrmWrite =
  | { kind: "command"; id: string; revision: number; command: Command }
  | { kind: "trip"; trip: Trip }
  | {
      kind: "delete";
      resource: "trip" | "enquiry";
      id: string;
      revision: number;
    };
export function canPreview(command: Command) {
  return [
    "note",
    "call",
    "task",
    "taskStatus",
    "stage",
    "qualify",
    "payment",
    "saveCall",
    "quote",
    "override",
  ].includes(command.type);
}
export function previewWrite(
  state: State,
  write: CrmWrite,
  actor: Identity,
): State | null {
  if (write.kind === "delete") {
    if (actor.role !== "manager")
      throw new Error("Only a manager can delete records.");
    if (write.resource === "trip") {
      const trip = state.trips.find((t) => t.id === write.id);
      if (!trip || trip.version !== write.revision)
        throw new Error("Trip changed. Refresh before deleting.");
      if (state.enquiries.some((e) => e.tripId === trip.id))
        throw new Error("Remove linked enquiries before deleting this trip.");
      return { ...state, trips: state.trips.filter((t) => t.id !== write.id) };
    }
    const enquiry = state.enquiries.find((e) => e.id === write.id);
    if (!enquiry || enquiry.revision !== write.revision)
      throw new Error("This enquiry changed. Reload before deleting.");
    if (!enquiry.sample && (enquiry.booking || enquiry.payments.length))
      throw new Error("Enquiries with financial history cannot be deleted.");
    return {
      ...state,
      enquiries: state.enquiries.filter((e) => e.id !== write.id),
    };
  }
  if (write.kind === "trip") {
    const current = state.trips.find((t) => t.id === write.trip.id);
    if (!current || current.version !== write.trip.version)
      throw new Error("Trip changed. Refresh before saving.");
    // Editing amounts changes the draft only; publication stays server-confirmed.
    tripSchema.parse(write.trip);
    return {
      ...state,
      trips: state.trips.map((t) =>
        t.id === current.id
          ? { ...write.trip, status: "draft", version: current.version + 1 }
          : t,
      ),
    };
  }
  if (!canPreview(write.command)) return null;
  const current = state.enquiries.find((e) => e.id === write.id);
  if (!current || current.revision !== write.revision)
    throw new Error("This enquiry changed. Reload before saving.");
  const trip = state.trips.find((t) => t.id === current.tripId);
  const next = applyCommand(current, write.command, trip?.groupVisaPolicy, {
    actor: actor.name,
    demo: actor.local,
  });
  if (write.command.type === "qualify") {
    if (!eligibleForRecompute(current)) {
      next.rank = current.rank;
      next.rankReason = current.rankReason;
      next.rankRuleVersion = current.rankRuleVersion;
      next.rankComputedAt = current.rankComputedAt;
    } else if (trip?.activeRules) {
      const fit = evaluateRules(trip.activeRules, next.group, next.visa);
      next.rank = fit.rank;
      next.rankReason = fit.reason;
      next.rankRuleVersion = trip.activeRuleVersion;
      next.rankComputedAt = new Date().toISOString();
    } else if (!actor.local) {
      next.rank = null;
      next.rankReason =
        "Needs qualification: no reviewed rule version is active.";
    }
  }
  return {
    ...state,
    enquiries: state.enquiries.map((e) => {
      if (e.id === next.id) return next;
      if (write.command.type === "qualify" && e.customerId === next.customerId)
        return { ...e, name: next.name, email: next.email, phone: next.phone };
      return e;
    }),
  };
}
export function rollbackWrite(
  current: State,
  previous: State,
  write: CrmWrite,
): State {
  if (write.kind === "delete") {
    // Restore just the removed record, preserving unrelated cache changes and order.
    const restore = <T extends { id: string }>(items: T[], originals: T[]) => {
      if (items.some((item) => item.id === write.id)) return items;
      const index = originals.findIndex((item) => item.id === write.id);
      if (index < 0) return items;
      const nextId = originals
        .slice(index + 1)
        .find((item) => items.some((value) => value.id === item.id))?.id;
      const insertion = nextId
        ? items.findIndex((item) => item.id === nextId)
        : items.length;
      return [
        ...items.slice(0, insertion),
        originals[index],
        ...items.slice(insertion),
      ];
    };
    return write.resource === "trip"
      ? { ...current, trips: restore(current.trips, previous.trips) }
      : {
          ...current,
          enquiries: restore(current.enquiries, previous.enquiries),
        };
  }
  if (write.kind === "trip")
    return {
      ...current,
      trips: current.trips.map((t) =>
        t.id === write.trip.id
          ? previous.trips.find((p) => p.id === t.id) || t
          : t,
      ),
    };
  const before = previous.enquiries.find((e) => e.id === write.id);
  return {
    ...current,
    enquiries: current.enquiries.map((e) => {
      if (e.id === write.id) return before || e;
      if (
        before &&
        write.command.type === "qualify" &&
        e.customerId === before.customerId
      ) {
        const original = previous.enquiries.find((p) => p.id === e.id);
        if (original)
          return {
            ...e,
            name: original.name,
            email: original.email,
            phone: original.phone,
          };
      }
      return e;
    }),
  };
}
