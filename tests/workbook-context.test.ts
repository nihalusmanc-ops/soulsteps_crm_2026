import { expect, it } from "vitest";
import {
  workbookFollowup,
  workbookLegend,
  workbookNextStep,
} from "../src/shared/workbook-context";
const notes = (...text: string[]) =>
  text.map((text, i) => ({
    text,
    sheet: "Synthetic",
    row: 2,
    cell: `V${i + 2}`,
  }));
it("uses the owner's exact colour meanings, including cyan, dark red, converted and purple review", () => {
  expect(workbookLegend.FF00FFFF).toBe("blue");
  expect(workbookLegend.FF980000).toBe("red");
  expect(workbookLegend.FF00FF00).toBe("green");
  expect(workbookLegend.FF9900FF).toBe("review");
  expect(workbookNextStep("green", "CONVERTED")).toContain("Verify booking");
});
it("extracts the latest explicit October callback date with the approved 2026 context", () => {
  const found = workbookFollowup(
    notes("call 19th oct, itinerary sent", "call 20th", "10 -11 th"),
  );
  expect(found?.date).toBe("2026-10-20");
  expect(found?.time).toBeUndefined();
  expect(found?.needsConfirmation).toBe(true);
  expect(workbookFollowup(notes("24th oct call 6pm"))?.time).toBe("18:00");
});
it("does not turn travel dates or completed call history into future follow-ups", () => {
  expect(
    workbookFollowup(
      notes(
        "28th Nov to 4th december | FOLLOW UP , FOLLOW UP 2 done , didt pick up",
      ),
    ),
  ).toBeUndefined();
  expect(
    workbookFollowup(notes("FOLLOW UP 2 DONE ON 24TH , NO PICK UP")),
  ).toBeUndefined();
  expect(
    workbookFollowup(notes("UK INTERESTED, 9TH NOV USA EMBASSY")),
  ).toBeUndefined();
  expect(workbookFollowup(notes("DECEMBER 15th"))).toBeUndefined();
});
it("keeps relative dates as written and never invents an exact time from after 6pm", () => {
  const found = workbookFollowup(notes("call tomorrow after 6 pm"));
  expect(found?.text).toBe("call tomorrow after 6 pm");
  expect(found?.date).toBeUndefined();
  expect(workbookFollowup(notes("call after 6 pm oct 17"))?.date).toBe(
    "2026-10-17",
  );
  expect(
    workbookFollowup(notes("call after 6 pm oct 17"))?.time,
  ).toBeUndefined();
});
