import { useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Plus, Search, Phone, ChevronDown, Save } from "lucide-react";
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
  const [period, setPeriod] = useViewParam("period", "");
  const [sort, setSort] = useViewParam("sort", "");
  const [direction, setDirection] = useViewParam("direction", "asc");
  const cutoff = period ? Date.now() - Number(period) * 86400000 : 0;
  const active = ["new", "followups", "all"].includes(tab) ? tab : "new";
  const sortedRows = data.enquiries
    .filter(
      (e) =>
        (active === "all" || callingList(e) === active) &&
        (!trip || e.tripId === trip) &&
        (!period ||
          (Date.parse(e.createdAt) >= cutoff &&
            Date.parse(e.createdAt) <= Date.now())) &&
        (!colour || leadColour(e) === colour) &&
        (!rank || (e.rank || "needs") === rank) &&
        (!dueOnly ||
          (nextTask(e)?.due &&
            dubaiDay(new Date(nextTask(e)!.due)) <= dubaiDay())) &&
        `${e.name} ${e.phone || ""} ${e.email} ${currentNote(e)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const value = (e: Enquiry) =>
        sort === "customer"
          ? e.name
          : sort === "priority"
            ? e.rank || "P7"
            : sort === "colour"
              ? leadColour(e)
              : sort === "note"
                ? currentNote(e)
                : nextTask(e)?.due || "z";
      return sort
        ? value(a).localeCompare(value(b), undefined, {
            numeric: true,
            sensitivity: "base",
          }) * (direction === "desc" ? -1 : 1) || a.id.localeCompare(b.id)
        : compareCalling(a, b, active !== "new");
    });
  // Preserve the visible order during background saves; filters and heading
  // clicks start a fresh ordering so staff never lose the row they are editing.
  const order = useRef<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const orderKey = JSON.stringify([
    active,
    search,
    trip,
    colour,
    dueOnly,
    rank,
    period,
    sort,
    direction,
  ]);
  if (order.current.key !== orderKey)
    order.current = { key: orderKey, ids: sortedRows.map((e) => e.id) };
  const positions = new Map(order.current.ids.map((id, index) => [id, index]));
  for (const e of sortedRows)
    if (!positions.has(e.id)) {
      positions.set(e.id, order.current.ids.length);
      order.current.ids.push(e.id);
    }
  const rows = sortedRows.sort(
    (a, b) => positions.get(a.id)! - positions.get(b.id)!,
  );
  function toggleSort(column: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("sort", column);
      next.set(
        "direction",
        sort === column && direction === "asc" ? "desc" : "asc",
      );
      return next;
    });
  }
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
        {
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
        }
        {
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
        }
        <select
          aria-label="Filter received date"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="">Received: all time</option>
          <option value="3">Last 3 days</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <select
          className="calling-mobile-sort"
          aria-label="Sort enquiries"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="">Default order</option>
          <option value="customer">Customer</option>
          <option value="priority">Priority</option>
          <option value="colour">Call colour</option>
          <option value="followup">Follow-up</option>
        </select>
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
        {(search || trip || colour || dueOnly || rank || period) && (
          <Button
            variant="ghost"
            onClick={() => setParams({ list: active }, { replace: true })}
          >
            Reset filters
          </Button>
        )}
      </div>
      <div className="calling-list" aria-label="Enquiries calling list">
        <div className="calling-columns">
          {[
            ["customer", "Customer / details"],
            ["priority", "Priority / trip"],
            ["colour", "Call colour"],
            ["note", "Note"],
            ["followup", "Follow-up / save"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => toggleSort(id)}
              aria-label={`Sort by ${label}`}
            >
              {label} {sort === id ? (direction === "asc" ? "↑" : "↓") : "↕"}
            </button>
          ))}
        </div>
        {rows.map((e) => (
          <CallRow
            key={e.id}
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
              {search || trip || colour || dueOnly || rank || period
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
  const colour = e.callColour || "";
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
      className={`call-row call-${savedColour}${busy || writes.pending ? " call-saving" : ""}`}
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
              <div className="call-qualification" id={`qualification-${e.id}`}>
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
          <select
            className="priority-number"
            aria-label={`Set priority for ${e.name}`}
            value={e.rank || ""}
            disabled={locked}
            title={e.rank ? e.rankReason : "Needs qualification (NQ)"}
            onChange={(ev) =>
              void save({
                type: "override",
                rank: ev.target.value as NonNullable<Enquiry["rank"]>,
                reason: "Staff selected priority from the calling list.",
              })
            }
          >
            <option value="" disabled>
              NQ
            </option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={`P${n}`}>
                P{n}
              </option>
            ))}
          </select>
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
            <span
              className="call-colour-dots"
              role="group"
              aria-label={`Call colour for ${e.name}`}
            >
              {Object.entries(callColours).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  className={`call-colour-dot swatch-${k}`}
                  aria-label={`${v} for ${e.name}`}
                  title={v}
                  aria-pressed={colour === k}
                  disabled={locked}
                  onClick={() =>
                    void save({ type: "callColour", colour: k as CallColour })
                  }
                >
                  <i />
                </button>
              ))}
            </span>
          )}
        </label>
        <div className="call-note">
          <label>
            <span className="mobile-field-label">Note</span>
            <textarea
              aria-label={`Note for ${e.name}`}
              placeholder="Write the latest call note…"
              value={note}
              ref={(field) => {
                if (!field) return;
                field.style.height = "44px";
                field.style.height = `${Math.max(44, field.scrollHeight + 2)}px`;
              }}
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
            <Button
              type="submit"
              size="sm"
              className="call-save-icon"
              disabled={locked}
              aria-label={
                initialCallDone(e) ? "Save call" : "Save initial call"
              }
              title="Save call note and follow-up"
            >
              <Save size={17} />
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
