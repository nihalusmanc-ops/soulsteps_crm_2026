import { useState, type MouseEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Plus, Search, Phone, ChevronDown } from "lucide-react";
import {
  callColours,
  leadColour,
  initialCallDone,
  callingList,
  compareCalling,
  currentNote,
  groupLabels,
  type CallColour,
} from "../shared/calling";
import {
  nextTask,
  dubaiDay,
  type Enquiry,
  type State,
  type Command,
} from "../shared/domain";
import { Button } from "./components/ui/button";
import { DateTimeField } from "./components/ui/date-time-field";
import { useViewParam } from "./components/ui/workspace";
import type { useCrmWrites } from "./data/use-crm-writes";

type Writes = ReturnType<typeof useCrmWrites>;
export function CallingWorkspace({
  data,
  writes,
  onCreate,
}: {
  data: State;
  writes: Writes;
  onCreate: () => void;
}) {
  const [, setParams] = useSearchParams();
  const [tab, setTab] = useViewParam("list", "new");
  const [search, setSearch] = useViewParam("q", "");
  const [trip, setTrip] = useViewParam("trip", "");
  const [colour, setColour] = useViewParam("colour", "");
  const [dueOnly, setDueOnly] = useViewParam("due", "");
  const [rank, setRank] = useViewParam("fit", "");
  const active = ["new", "followups", "all"].includes(tab) ? tab : "new";
  const rows = data.enquiries
    .filter(
      (e) =>
        (active === "all" || callingList(e) === active) &&
        (!trip || e.tripId === trip) &&
        (!colour || leadColour(e) === colour) &&
        (!rank || (e.rank || "needs") === rank) &&
        (!dueOnly ||
          (nextTask(e)?.due &&
            dubaiDay(new Date(nextTask(e)!.due)) <= dubaiDay())) &&
        `${e.name} ${e.phone || ""} ${e.email} ${currentNote(e)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => compareCalling(a, b, active !== "new"));
  const count = (list: string) =>
    data.enquiries.filter((e) => callingList(e) === list).length;
  return (
    <div className="calling-workspace">
      <div className="page-heading">
        <div>
          <h1>Enquiries</h1>
          <p className="muted">
            {active === "new"
              ? "Start with the enquiries waiting for their first call."
              : active === "followups"
                ? "Pick up the next conversation."
                : "Every enquiry, including converted and disqualified."}
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} />
          New enquiry
        </Button>
      </div>
      <nav className="calling-tabs" aria-label="Calling lists">
        {[
          ["new", "New enquiries", count("new")],
          ["followups", "Follow-ups", count("followups")],
          ["all", "All enquiries", data.enquiries.length],
        ].map(([id, label, n]) => (
          <button
            key={id}
            aria-current={active === id ? "page" : undefined}
            onClick={() => {
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("list", String(id));
                next.delete("colour");
                next.delete("fit");
                next.delete("due");
                return next;
              });
            }}
          >
            {label}
            <span>{n}</span>
          </button>
        ))}
      </nav>
      <div className="calling-toolbar">
        <label className="calling-search">
          <Search size={17} />
          <input
            aria-label="Search enquiries"
            placeholder="Search name, phone or note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter trip"
          value={trip}
          onChange={(e) => setTrip(e.target.value)}
        >
          <option value="">All trips</option>
          {data.trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {active === "new" ? (
          <select
            aria-label="Filter priority"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
          >
            <option value="">All priorities</option>
            <option value="needs">Needs qualification</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>P{n}</option>
            ))}
          </select>
        ) : (
          <select
            aria-label="Filter colour"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
          >
            <option value="">All colours</option>
            {Object.entries(callColours).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="green">Converted · deposit added</option>
            <option value="none">No colour</option>
          </select>
        )}
        {active === "followups" && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!dueOnly}
              onChange={(e) => setDueOnly(e.target.checked ? "1" : "")}
            />
            Due & overdue only
          </label>
        )}
        {(search || trip || colour || dueOnly || rank) && (
          <Button
            variant="ghost"
            onClick={() => setParams({ list: active }, { replace: true })}
          >
            Reset filters
          </Button>
        )}
      </div>
      <div className="calling-list" aria-label="Enquiries calling list">
        <div className="calling-columns" aria-hidden="true">
          <span>Customer / details</span>
          <span>Priority / trip</span>
          <span>Call colour</span>
          <span>Note</span>
          <span>Follow-up / save</span>
        </div>
        {rows.map((e) => (
          <CallRow
            key={`${e.id}:${e.revision}`}
            enquiry={e}
            tripName={
              data.trips.find((t) => t.id === e.tripId)?.name || "Trip not set"
            }
            writes={writes}
          />
        ))}
        {!rows.length && (
          <div className="calling-empty">
            <h2>
              {active === "new"
                ? "No new enquiries waiting"
                : "No enquiries in this list"}
            </h2>
            <p className="muted">
              {search || trip || colour || dueOnly || rank
                ? "Try changing the filters."
                : active === "new"
                  ? "You can continue with your follow-ups."
                  : "Enquiries will appear here when they match this list."}
            </p>
            {active === "new" && (
              <Button variant="outline" onClick={() => setTab("followups")}>
                Open follow-ups
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="calling-count muted">
        {rows.length} {rows.length === 1 ? "enquiry" : "enquiries"}
        {active === "new"
          ? " · Needs qualification first, then P1–P6"
          : active === "followups"
            ? " · Ordered by call colour"
            : ""}
      </p>
    </div>
  );
}

function CallRow({
  enquiry: e,
  tripName,
  writes,
}: {
  enquiry: Enquiry;
  tripName: string;
  writes: Writes;
}) {
  const location = useLocation();
  const savedColour = leadColour(e);
  const [colour, setColour] = useState<CallColour | "">(e.callColour || "");
  const [note, setNote] = useState(currentNote(e));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const task = nextTask(e);
  const [due, setDue] = useState(
    task
      ? new Date(Date.parse(task.due) + 4 * 3600000).toISOString().slice(0, 16)
      : "",
  );
  const [group, setGroup] = useState(e.group);
  const [visa, setVisa] = useState<Enquiry["visa"]>(
    e.visa === "some" ? "unknown" : e.visa,
  );
  const [pax, setPax] = useState(e.travellers?.toString() || "");
  const originalSaveUncertain =
    writes.retryable &&
    writes.failedWrite?.kind === "command" &&
    writes.failedWrite.id === e.id;
  const locked = busy || writes.pending || originalSaveUncertain;
  const converted = savedColour === "green";
  const closed = converted || !!e.booking;
  async function save(command: Command) {
    if (locked || writes.locked()) return;
    setBusy(true);
    setMessage("");
    const ok = await writes.command(e.id, e.revision, command);
    if (!ok)
      setMessage(
        "Could not save. Review the error above; your original save can be retried.",
      );
    setBusy(false);
  }
  const openRow = (ev: MouseEvent<HTMLElement>) => {
    if (
      ev.target instanceof Element &&
      !ev.target.closest(
        "a,button,input,textarea,select,summary,label,.date-time-field",
      ) &&
      !window.getSelection()?.toString()
    )
      ev.currentTarget
        .querySelector<HTMLAnchorElement>("a.customer-link")
        ?.click();
  };
  return (
    <article
      className={`call-row call-${savedColour}`}
      aria-label={`${e.name} · ${converted ? "Converted" : e.callColour ? callColours[e.callColour] : "Not called"}`}
      onClick={openRow}
    >
      <form
        className="call-row-grid"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!colour) {
            setMessage("Choose a call colour first.");
            return;
          }
          void save({
            type: "saveCall",
            colour,
            note: note.trim(),
            ...(due && colour !== "red"
              ? { followup: new Date(`${due}:00+04:00`).toISOString() }
              : {}),
          });
        }}
      >
        <div className="call-customer">
          <div className="call-name-line">
            <Link
              className="customer-link"
              to={`/enquiries/${e.id}`}
              state={{ from: location.pathname + location.search }}
            >
              {e.name}
            </Link>
            {e.sample && <span className="sample-label">Sample</span>}
          </div>
          {e.phone && !e.sample ? (
            <a className="call-phone" href={`tel:${e.phone}`}>
              <Phone size={12} />
              {e.phone}
            </a>
          ) : (
            <span className="call-phone">{e.phone || "No phone recorded"}</span>
          )}
          <div className="call-details">
            <div className="call-facts">
              <span>
                {e.travellers ?? "—"} · {groupLabels[e.group]}
              </span>
              <span>
                Schengen:{" "}
                {e.visa === "all"
                  ? "Yes"
                  : e.visa === "none"
                    ? "No"
                    : "Not set"}
              </span>
            </div>
            <details>
              <summary>
                Edit details <ChevronDown size={12} />
              </summary>
              <div className="call-qualification">
                <label>
                  Group
                  <select
                    aria-label={`Group for ${e.name}`}
                    value={group}
                    onChange={(ev) =>
                      setGroup(ev.target.value as Enquiry["group"])
                    }
                    disabled={locked}
                  >
                    {Object.entries(groupLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Schengen
                  <select
                    aria-label={`Schengen for ${e.name}`}
                    value={visa}
                    onChange={(ev) =>
                      setVisa(ev.target.value as Enquiry["visa"])
                    }
                    disabled={locked}
                  >
                    <option value="unknown">Not set</option>
                    <option value="all">Yes</option>
                    <option value="none">No</option>
                  </select>
                </label>
                <label>
                  Travellers
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    aria-label={`Travellers for ${e.name}`}
                    value={pax}
                    onChange={(ev) => setPax(ev.target.value)}
                    disabled={locked}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={locked}
                  onClick={() =>
                    void save({
                      type: "qualify",
                      group,
                      visa: visa as Enquiry["visa"],
                      travellers: pax ? Number(pax) : null,
                      temperature: e.temperature,
                      availability: e.availability,
                    })
                  }
                >
                  Save details
                </Button>
              </div>
            </details>
          </div>
        </div>
        <div className="call-priority">
          <span className={e.rank ? "priority-number" : "priority-missing"}>
            {e.rank || "Needs qualification"}
          </span>
          <div className="call-trip">{tripName}</div>
          <small className="call-progress">
            {initialCallDone(e) ? "Initial call done" : "Not called"}
          </small>
        </div>
        <label className="call-colour-control">
          <span className="mobile-field-label">Call colour</span>
          {closed ? (
            <span className="call-outcome">
              <i />
              {converted ? "Converted · deposit added" : "Booking confirmed"}
            </span>
          ) : (
            <select
              required
              aria-label={`Call colour for ${e.name}`}
              value={colour}
              onChange={(ev) => setColour(ev.target.value as CallColour)}
              disabled={locked}
            >
              <option value="" disabled>
                No colour yet
              </option>
              {Object.entries(callColours).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="call-note">
          <label>
            <span className="mobile-field-label">Note</span>
            <textarea
              aria-label={`Note for ${e.name}`}
              placeholder="Write the latest call note…"
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              maxLength={4000}
              required={!closed}
              disabled={locked}
            />
          </label>
          {note.trim() && note !== currentNote(e) && (
            <button
              className="note-only-save"
              type="button"
              disabled={locked}
              onClick={() => void save({ type: "note", text: note.trim() })}
            >
              Save note only
            </button>
          )}
        </div>
        <div className="call-actions">
          {initialCallDone(e) &&
            !closed &&
            colour !== "red" &&
            due !==
              (task
                ? new Date(Date.parse(task.due) + 4 * 3600000)
                    .toISOString()
                    .slice(0, 16)
                : "") && (
              <button
                type="button"
                className="note-only-save"
                disabled={locked}
                onClick={() => {
                  if (due)
                    void save({
                      type: "task",
                      due: new Date(`${due}:00+04:00`).toISOString(),
                      kind: "Follow-up",
                      note,
                      ...(task ? { replaces: task.id } : {}),
                    });
                  else if (task)
                    void save({
                      type: "taskStatus",
                      taskId: task.id,
                      status: "cancelled",
                      reason: "Follow-up date cleared by staff.",
                    });
                }}
              >
                Save follow-up only
              </button>
            )}
          {!closed && colour !== "red" && (
            <>
              <label>
                <span className="mobile-field-label">Follow-up</span>
                <DateTimeField
                  type="datetime-local"
                  pickerLabel={`Follow-up for ${e.name}`}
                  aria-label={`Follow-up date for ${e.name}`}
                  value={due}
                  onChange={(ev) => setDue(ev.target.value)}
                  disabled={locked}
                />
                {!due && <small>Not scheduled</small>}
              </label>
            </>
          )}
          {!closed && (
            <Button type="submit" size="sm" disabled={locked}>
              {busy
                ? "Saving…"
                : initialCallDone(e)
                  ? "Save call"
                  : "Save initial call"}
            </Button>
          )}
          {closed && (
            <Link
              className="button"
              to={`/enquiries/${e.id}?tab=payments`}
              state={{ from: location.pathname + location.search }}
            >
              View deposit
            </Link>
          )}
        </div>
        {message && (
          <p className="call-row-error" role="alert">
            {message}
          </p>
        )}
      </form>
    </article>
  );
}
