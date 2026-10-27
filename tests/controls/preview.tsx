import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DateTimeField } from "../../src/web/components/ui/date-time-field";
import { Modal } from "../../src/web/components/ui/modal";
import "../../src/web/styles.css";
import "../../src/web/workspace.css";
import "../../src/web/quiet.css";
import "../../src/web/pickers.css";
function Preview() {
  const [open, setOpen] = useState(true),
    [start, setStart] = useState("09:00"),
    [saved, setSaved] = useState("");
  return (
    <>
      <button onClick={() => setOpen(true)}>Open form</button>
      <Modal
        title="Picker preview"
        description="Isolated fictional form. No API calls."
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(
              JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
            );
          }}
        >
          <label>
            Task type
            <select name="kind" aria-label="Task type">
              <option>Follow-up</option>
              <option>Callback</option>
              <option disabled>Unavailable option</option>
            </select>
          </label>
          <label>
            Accepted date and time · Dubai
            <DateTimeField
              type="datetime-local"
              name="due"
              pickerLabel="Follow-up date and time"
              required
            />
          </label>
          <label>
            Departure date
            <DateTimeField
              type="date"
              name="departure"
              pickerLabel="Departure date"
              defaultValue="2026-12-10"
            />
          </label>
          <label>
            Business start
            <DateTimeField
              type="time"
              name="start"
              pickerLabel="Business start time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <button className="button primary" type="submit">
            Save preview
          </button>
          <pre id="saved">{saved}</pre>
        </form>
      </Modal>
    </>
  );
}
createRoot(document.getElementById("preview")!).render(<Preview />);
