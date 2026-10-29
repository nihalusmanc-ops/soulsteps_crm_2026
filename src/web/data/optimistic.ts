import {
  applyCommand,
  type Command,
  type State,
  type Trip,
} from "../../shared/domain";
import type { Identity } from "../../shared/api";

export type CrmWrite =
  | { kind: "command"; id: string; revision: number; command: Command }
  | { kind: "trip"; trip: Trip };
export function canPreview(command: Command) {
  return [
    "note",
    "call",
    "task",
    "taskStatus",
    "stage",
    "qualify",
    "payment",
  ].includes(command.type);
}
export function previewWrite(
  state: State,
  write: CrmWrite,
  actor: Identity,
): State | null {
  if (write.kind === "trip") {
    const current = state.trips.find((t) => t.id === write.trip.id);
    if (!current || current.version !== write.trip.version)
      throw new Error("Trip changed. Refresh before saving.");
    // Amounts and publication changes always wait for the server.
    if (
      current.price !== write.trip.price ||
      current.deposit !== write.trip.deposit
    )
      return null;
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
    // Reviewed rules and rank recomputation are authoritative on the server.
    next.rank = current.rank;
    next.rankReason = current.rankReason;
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
