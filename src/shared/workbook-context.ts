export type LeadColour =
  | "red"
  | "orange"
  | "blue"
  | "yellow"
  | "magenta"
  | "green"
  | "review"
  | "unmarked";
export const leadColourLabels: Record<LeadColour, string> = {
  red: "Disqualified",
  orange: "Warm lead",
  blue: "Follow-up / no connection",
  yellow: "Interest sparked / itinerary sent",
  magenta: "Connected, couldn't talk",
  green: "Converted · verify booking",
  review: "Review required",
  unmarked: "Not colour-coded",
};
export const workbookLegend: Record<string, LeadColour> = {
  FFFF0000: "red",
  FF980000: "red",
  FFFF9900: "orange",
  FF4A86E8: "blue",
  FF0000FF: "blue",
  FF00FFFF: "blue",
  FFFFFF00: "yellow",
  FFFF00FF: "magenta",
  FF00FF00: "green",
  FF9900FF: "review",
};
export type WorkbookNote = {
  text: string;
  sheet: string;
  row: number;
  cell: string;
};
export type WorkbookFollowup = {
  text: string;
  date?: string;
  time?: string;
  needsConfirmation: boolean;
  reason: string;
};
export type WorkbookContext = {
  version?: string;
  colour: LeadColour;
  colours: string[];
  latestNote: string;
  notes: WorkbookNote[];
  nextStep: string;
  followup?: WorkbookFollowup;
  reviewReasons: string[];
};
const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const pad = (v: number) => String(v).padStart(2, "0");
function dayKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : undefined;
}
/** Extract an explicitly written callback date, never travel dates or completed-call dates. */
export function workbookFollowup(
  notes: WorkbookNote[],
  year = 2026,
  bareMonth = 10,
): WorkbookFollowup | undefined {
  for (const note of [...notes].reverse()) {
    const text = note.text.trim();
    if (
      !/\bcall\b|follow\s*up|followup|\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
        text,
      )
    )
      continue;
    if (
      /\b(?:done|completed|called)\b/i.test(text) &&
      !/\b(?:call on|call again|follow\s*up again)\b/i.test(text)
    )
      continue;
    // A date range, journey or departure is not an accepted callback.
    const clauses = text
      .split(/[|;\n]/)
      .filter((c) => /\bcall\b|follow\s*up|followup/i.test(c));
    for (const clause of clauses.reverse()) {
      if (
        /\b(?:trip|depart|embassy|arriv|travel|journey)\w*\b/i.test(clause) ||
        /\d(?:st|nd|rd|th)?\s*(?:[a-z]+\s*)?(?:to|–|-)\s*\d/i.test(clause)
      )
        continue;
      const dm = clause.match(
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)(?:[ ,]+(20\d{2}))?\b/i,
      );
      const md = clause.match(
        /\b(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(20\d{2}))?\b/i,
      );
      const bare = clause.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
      let date = dm
        ? dayKey(
            Number(dm[3] || year),
            months[dm[2].slice(0, 3).toLowerCase()],
            Number(dm[1]),
          )
        : md
          ? dayKey(
              Number(md[3] || year),
              months[md[1].slice(0, 3).toLowerCase()],
              Number(md[2]),
            )
          : bare
            ? dayKey(year, bareMonth, Number(bare[1]))
            : undefined;
      const ampm = clause.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
      let time: string | undefined;
      if (
        ampm &&
        Number(ampm[1]) >= 1 &&
        Number(ampm[1]) <= 12 &&
        !/\bafter\s+\d/i.test(clause)
      )
        time = `${pad((Number(ampm[1]) % 12) + (ampm[3].toLowerCase() === "pm" ? 12 : 0))}:${ampm[2] || "00"}`;
      if (date)
        return {
          text,
          date,
          time,
          needsConfirmation: !time,
          reason: time
            ? "Workbook callback time · Dubai; review whether still outstanding."
            : "Date from workbook; agree a time before scheduling.",
        };
    }
    if (
      /\b(?:today|tomorrow|next\s+(?:week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bafter\s+(?:one|two|half|\d+)\b/i.test(
        text,
      )
    )
      return {
        text,
        needsConfirmation: true,
        reason:
          "Relative wording preserved; the date it was written is unknown.",
      };
    if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\bo.?clock\b/i.test(text))
      return {
        text,
        needsConfirmation: true,
        reason:
          "A time is mentioned but no complete callback date is recorded.",
      };
  }
}
export function workbookNextStep(colour: LeadColour, latestNote: string) {
  if (colour === "red")
    return "Disqualified. Review only if the customer returns.";
  if (colour === "green")
    return "Verify booking details and deposit before confirming the booking.";
  if (colour === "review")
    return "Review the workbook status and notes before changing the enquiry.";
  if (colour === "magenta") return "Call back when the customer can speak.";
  if (/itinerar|details sent/i.test(latestNote))
    return "Follow up on the itinerary or details already sent.";
  if (
    /did.?t pick|not pick|no (?:answer|response)|couldn.?t connect|unreach/i.test(
      latestNote,
    )
  )
    return "Try to reconnect with the customer and agree the next step.";
  if (colour === "orange") return "Follow up with this warm lead.";
  if (colour === "yellow")
    return "Follow up on the customer's interest and itinerary.";
  if (colour === "blue") return "Follow up to reconnect with the customer.";
  return latestNote
    ? "Review the latest note and agree the next step."
    : "Contact the customer and record the next step.";
}
