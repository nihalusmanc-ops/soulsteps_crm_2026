import type { Enquiry } from "./domain";

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
