import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Phone,
  ChevronDown,
  Save,
  SlidersHorizontal,
  X,
  ArrowUpDown,
} from "lucide-react";
import {
  callColours,
  leadColour,
  initialCallDone,
  callingList,
  compareCalling,
  compareColumn,
  currentNote,
  groupLabels,
  followupTask,
  localDue,
  dueMatches,
  followupLabel,
  receivedAgeLabel,
  enquiryStatus,
  type CallColour,
} from "../shared/calling";
import {
  dubaiDay,
  isOpen,
  type Enquiry,
  type State,
  type Command,
} from "../shared/domain";
import { Button } from "./components/ui/button";
import { DateTimeField } from "./components/ui/date-time-field";
import type { useCrmWrites } from "./data/use-crm-writes";
import type { CallingWrites, DraftField } from "./data/use-calling-writes";

type Writes = ReturnType<typeof useCrmWrites>;
const dueFilters = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["unscheduled", "Not scheduled"],
] as const;
const statuses = {
  new: "Not called",
  followups: "Follow-up",
  disqualified: "Disqualified",
  deposit: "Deposit received",
  closed: "Other closed",
};
const columns = [
  ["customer", "Customer / details"],
  ["priority", "Priority / trip"],
  ["colour", "Call colour"],
  ["note", "Note"],
  ["followup", "Follow-up / save"],
];
const savedDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

export function CallingWorkspace({
  data,
  writes,
  onCreate,
}: {
  data: State;
  writes: Writes;
  onCreate: () => void;
}) {
  const calling = writes.calling!;
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  const renderedSearch = useRef(params.toString());
  if (renderedSearch.current !== params.toString()) {
    renderedSearch.current = params.toString();
    paramsRef.current = params;
  }
  const get = (key: string) => params.get(key) || "";
  const active = ["new", "followups", "all"].includes(get("list"))
    ? get("list")
    : "new";
  const search = get("q"),
    trip = get("trip"),
    colour = get("colour"),
    rank = get("fit"),
    period = get("period"),
    due = get("due"),
    status = get("status"),
    sort = get("sort"),
    direction = get("direction") || "asc";
  const [filtersOpen, setFiltersOpen] = useState(false),
    [legendOpen, setLegendOpen] = useState(false);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const controls = useRef<HTMLDivElement>(null),
    workspace = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = controls.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      workspace.current?.style.setProperty(
        "--calling-controls-height",
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    calling.views.set(active, params.toString());
  }, [calling, active, params]);
  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(patch))
      value ? next.set(key, value) : next.delete(key);
    paramsRef.current = next;
    calling.views.set(active, next.toString());
    setParams(next, { replace: true });
  }
  function switchTab(tab: string) {
    calling.views.set(active, paramsRef.current.toString());
    const next = new URLSearchParams(calling.views.get(tab) || "");
    next.set("list", tab);
    paramsRef.current = next;
    setParams(next);
    setFiltersOpen(false);
  }
  const listRows = data.enquiries.filter(
    (e) => active === "all" || callingList(e) === active,
  );
  const matchesBase = (e: Enquiry) =>
    (!trip || e.tripId === trip) &&
    (!colour || leadColour(e) === colour) &&
    (!rank || (e.rank || "needs") === rank) &&
    (!period ||
      (Date.parse(e.createdAt) >= Date.now() - Number(period) * 86400000 &&
        Date.parse(e.createdAt) <= Date.now())) &&
    (!status || enquiryStatus(e) === status) &&
    `${e.name} ${e.phone || ""} ${e.email} ${currentNote(e)}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  const baseRows = listRows.filter(matchesBase);
  const sortedRows = baseRows
    .filter((e) => dueMatches(e, due))
    .sort((a, b) =>
      sort
        ? compareColumn(a, b, sort, direction)
        : compareCalling(a, b, active !== "new"),
    );
  const order = useRef<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const orderKey = JSON.stringify([
    active,
    search,
    trip,
    colour,
    rank,
    period,
    due,
    status,
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
  const chips = [
    ...(search ? [["q", `Search: ${search}`]] : []),
    ...(trip
      ? [["trip", data.trips.find((t) => t.id === trip)?.name || "Trip"]]
      : []),
    ...(rank ? [["fit", rank === "needs" ? "Needs qualification" : rank]] : []),
    ...(colour
      ? [
          [
            "colour",
            colour === "green"
              ? "Deposit received"
              : colour === "none"
                ? "No colour"
                : callColours[colour as CallColour] || colour,
          ],
        ]
      : []),
    ...(period ? [["period", `Last ${period} days`]] : []),
    ...(status
      ? [["status", statuses[status as keyof typeof statuses] || status]]
      : []),
    ...(due
      ? [
          [
            "due",
            dueFilters.find(([key]) => key === due)?.[1] || "Due & overdue",
          ],
        ]
      : []),
  ];
  function toggleSort(column: string) {
    update({
      sort: column,
      direction: sort === column && direction === "asc" ? "desc" : "asc",
    });
  }
  const reset = () =>
    update({
      q: "",
      trip: "",
      fit: "",
      colour: "",
      period: "",
      due: "",
      status: "",
    });
  return (
    <div className="calling-workspace" ref={workspace}>
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
      <div className="calling-controls" ref={controls}>
        <nav className="calling-tabs" aria-label="Calling lists">
          {[
            ["new", "New enquiries"],
            ["followups", "Follow-ups"],
            ["all", "All enquiries"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={active === id ? "page" : undefined}
              onClick={() => switchTab(id)}
            >
              {label}
              <span>
                {id === "all"
                  ? data.enquiries.length
                  : data.enquiries.filter((e) => callingList(e) === id).length}
              </span>
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
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="calling-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="calling-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={16} />
            Filters{chips.length > 0 && <span>{chips.length}</span>}
          </button>
          <button
            type="button"
            className="calling-guide-toggle"
            aria-expanded={legendOpen}
            aria-controls="calling-legend"
            onClick={() => setLegendOpen(!legendOpen)}
          >
            Colour guide
          </button>
          <div
            className={`calling-filters ${filtersOpen ? "is-open" : ""}`}
            id="calling-filters"
          >
            <select
              aria-label="Filter trip"
              value={trip}
              onChange={(e) => update({ trip: e.target.value })}
            >
              <option value="">All trips</option>
              {data.trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter priority"
              value={rank}
              onChange={(e) => update({ fit: e.target.value })}
            >
              <option value="">All priorities</option>
              <option value="needs">Needs qualification</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n}>P{n}</option>
              ))}
            </select>
            <select
              aria-label="Filter colour"
              value={colour}
              onChange={(e) => update({ colour: e.target.value })}
            >
              <option value="">All colours</option>
              {Object.entries(callColours).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              <option value="green">Deposit received</option>
              <option value="none">No colour</option>
            </select>
            <select
              aria-label="Filter received date"
              value={period}
              onChange={(e) => update({ period: e.target.value })}
            >
              <option value="">Received: all time</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            {active === "all" && (
              <select
                aria-label="Filter enquiry status"
                value={status}
                onChange={(e) => update({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Sort enquiries"
              value={sort}
              onChange={(e) =>
                update({
                  sort: e.target.value,
                  direction: e.target.value === "received" ? "desc" : "asc",
                })
              }
            >
              <option value="">Default order</option>
              <option value="customer">Customer</option>
              <option value="priority">Priority</option>
              <option value="colour">Call colour</option>
              <option value="received">Received date</option>
              <option value="followup">Follow-up date</option>
              <option value="note">Note</option>
            </select>
            {sort && (
              <button
                type="button"
                className="calling-sort-direction"
                aria-label={
                  direction === "asc" ? "Sort descending" : "Sort ascending"
                }
                onClick={() =>
                  update({ direction: direction === "asc" ? "desc" : "asc" })
                }
              >
                <ArrowUpDown size={14} />
                {sort === "received"
                  ? direction === "desc"
                    ? "Newest first"
                    : "Oldest first"
                  : direction === "asc"
                    ? "Ascending"
                    : "Descending"}
              </button>
            )}
          </div>
        </div>
        {legendOpen && (
          <div className="calling-legend" id="calling-legend">
            {Object.entries(callColours).map(([key, label]) => (
              <span key={key} className={`swatch-${key}`}>
                <i />
                {label}
              </span>
            ))}
            <span className="swatch-green">
              <i />
              Deposit received
            </span>
            <span>NQ = Needs qualification</span>
            <p>
              Colours save immediately. Use the save icon to record a call
              attempt.
            </p>
          </div>
        )}
        {active === "followups" && (
          <div className="calling-due-filters" aria-label="Follow-up timing">
            <button
              type="button"
              aria-pressed={!due}
              onClick={() => update({ due: "" })}
            >
              All <span>{baseRows.length}</span>
            </button>
            {dueFilters.map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={due === id}
                onClick={() => update({ due: due === id ? "" : id })}
              >
                {label}
                <span>{baseRows.filter((e) => dueMatches(e, id)).length}</span>
              </button>
            ))}
          </div>
        )}
        <div className="calling-filter-summary">
          <span>
            Showing {rows.length} of {listRows.length}
          </span>
          <div className="calling-active-filters">
            {chips.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-label={`Remove ${label} filter`}
                onClick={() => update({ [key]: "" })}
              >
                {label}
                <X size={12} />
              </button>
            ))}
            {chips.length > 0 && (
              <button type="button" className="calling-reset" onClick={reset}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      </div>
      {calling.failures.map((failure) => (
        <div role="alert" className="error-banner" key={failure.id}>
          <span>
            {failure.name}: {failure.error.message} Your unfinished edits are
            kept.
          </span>
          <Button
            variant="ghost"
            disabled={calling.isPending(failure.id)}
            onClick={() => void calling.retry(failure.id)}
          >
            Retry save
          </Button>
          <Button variant="ghost" onClick={() => calling.dismiss(failure.id)}>
            Dismiss
          </Button>
        </div>
      ))}
      <div className="calling-list" aria-label="Enquiries calling list">
        <div className="calling-columns">
          {columns.map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => toggleSort(id)}
              aria-label={`Sort by ${label}`}
              aria-describedby={
                sort === id ? "calling-sort-description" : undefined
              }
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
            calling={calling}
            onDisqualify={() => setUndo({ id: e.id, name: e.name })}
          />
        ))}
        {!rows.length && (
          <div className="calling-empty">
            <h2>No enquiries in this list</h2>
            <p className="muted">
              {chips.length
                ? "Try changing the filters."
                : active === "new"
                  ? "You can continue with your follow-ups."
                  : "Enquiries will appear here when they match this list."}
            </p>
            {chips.length > 0 ? (
              <Button variant="outline" onClick={reset}>
                Reset filters
              </Button>
            ) : (
              active === "new" && (
                <Button
                  variant="outline"
                  onClick={() => switchTab("followups")}
                >
                  Open follow-ups
                </Button>
              )
            )}
          </div>
        )}
      </div>
      <p className="calling-count muted" id="calling-sort-description">
        {sort
          ? `${sort === "received" ? "Received date" : columns.find(([id]) => id === sort)?.[1] || sort} · ${direction === "asc" ? "Ascending" : "Descending"}`
          : active === "new"
            ? "Needs qualification first, then P1–P6"
            : active === "followups"
              ? "Ordered by call colour"
              : "Default colour order"}
        {sort && (
          <button
            type="button"
            onClick={() => update({ sort: "", direction: "" })}
          >
            Default order
          </button>
        )}
      </p>
      {undo && (
        <div className="calling-undo" role="status">
          <span>{undo.name} disqualified.</span>
          <button
            type="button"
            onClick={() => {
              void calling.command(undo.id, { type: "reopen" });
              setUndo(null);
            }}
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss undo"
            onClick={() => setUndo(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function CallRow({
  enquiry: e,
  tripName,
  calling,
  onDisqualify,
}: {
  enquiry: Enquiry;
  tripName: string;
  calling: CallingWrites;
  onDisqualify: () => void;
}) {
  const location = useLocation();
  const [message, setMessage] = useState(""),
    [logging, setLogging] = useState(false);
  const task = followupTask(e),
    savedDue = localDue(task?.due),
    savedNote = currentNote(e);
  const value = (field: DraftField, saved: string) =>
    calling.draft(e.id, field)?.value ?? saved;
  const note = value("note", savedNote),
    due = value("due", savedDue),
    group = value("group", e.group) as Enquiry["group"],
    visa = value(
      "visa",
      e.visa === "some" ? "unknown" : e.visa,
    ) as Enquiry["visa"],
    pax = value("pax", e.travellers?.toString() || "");
  const edit = (field: DraftField, next: string, saved: string) =>
    calling.edit(e.id, field, next, saved);
  const pending = calling.isPending(e.id),
    failed = !!calling.error(e.id),
    converted = leadColour(e) === "green",
    closed = converted || !!e.booking,
    salesClosed = callingList(e) === "closed";
  const noteConflict = calling.conflict(e.id, "note", savedNote),
    dueConflict = calling.conflict(e.id, "due", savedDue);
  useEffect(() => {
    if (pending || failed) return;
    for (const [field, saved] of [
      ["note", savedNote],
      ["due", savedDue],
    ] as const) {
      const draft = calling.draft(e.id, field);
      if (draft && draft.value === saved)
        calling.saved(e.id, field, draft.value);
    }
  }, [calling, e.id, pending, failed, savedNote, savedDue]);
  async function save(command: Command) {
    setMessage("");
    const ok = await calling.command(e.id, command);
    return ok;
  }
  async function recordCall() {
    if (logging || failed) return;
    if (!e.callColour) {
      setMessage("Choose a call colour first.");
      return;
    }
    if (!note.trim()) {
      setMessage("Add a note to record this call attempt.");
      return;
    }
    if (noteConflict || dueConflict) {
      setMessage(
        "Resolve the changed note or follow-up before recording the call.",
      );
      return;
    }
    setLogging(true);
    const ok = await save({
      type: "saveCall",
      colour: e.callColour,
      note: note.trim(),
      ...(due && e.callColour !== "red"
        ? { followup: new Date(`${due}:00+04:00`).toISOString() }
        : {}),
    });
    if (ok) {
      calling.saved(e.id, "note", note);
      calling.saved(e.id, "due", due);
    }
    setLogging(false);
  }
  const openRow = (ev: MouseEvent<HTMLElement>) => {
    if (
      ev.target instanceof Element &&
      !ev.target.closest(
        "a,button,input,textarea,select,summary,label,.date-time-field,details",
      ) &&
      !window.getSelection()?.toString()
    )
      ev.currentTarget
        .querySelector<HTMLAnchorElement>("a.customer-link")
        ?.click();
  };
  const quickDate = (days: number) => {
    const date = dubaiDay(new Date(Date.now() + days * 86400000));
    const time = (due || localDue(new Date().toISOString())).slice(11, 16);
    edit("due", `${date}T${time}`, savedDue);
  };
  const conflictControl = (field: "note" | "due", saved: string) => (
    <div className="calling-draft-conflict">
      <span>
        {field === "note" ? "Note" : "Follow-up"} changed elsewhere. Your draft
        is kept.
      </span>
      <button type="button" onClick={() => calling.discardDraft(e.id, field)}>
        Use latest
      </button>
      <button
        type="button"
        onClick={() => {
          calling.keepDraft(e.id, field, saved);
          if (calling.error(e.id))
            void calling
              .retry(e.id)
              .then(() => calling.flushDraft(e.id, field));
          else void calling.flushDraft(e.id, field);
        }}
      >
        Keep my edit
      </button>
    </div>
  );
  return (
    <article
      className={`call-row call-${leadColour(e)}${pending ? " call-saving" : ""}`}
      aria-label={`${e.name} · ${converted ? "Converted" : e.callColour ? callColours[e.callColour] : "Not called"}`}
      onClick={openRow}
    >
      <form
        className="call-row-grid"
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && ev.target instanceof HTMLInputElement) {
            ev.preventDefault();
            if (
              ev.target.type === "datetime-local" &&
              !ev.target.validity.badInput
            )
              calling.commitDue(e.id);
          }
        }}
        onSubmit={(ev) => {
          ev.preventDefault();
          void recordCall();
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
          <div className="call-facts">
            <span>
              {e.travellers ?? "—"} · {groupLabels[e.group]}
            </span>
            <span>
              Schengen:{" "}
              {e.visa === "all" ? "Yes" : e.visa === "none" ? "No" : "Not set"}
            </span>
          </div>
          <small
            className="call-received"
            title={`Received ${savedDate(e.createdAt)} (Dubai)`}
          >
            Received {savedDate(e.createdAt)} · {receivedAgeLabel(e.createdAt)}
          </small>
          <details className="call-details">
            <summary>
              Edit details <ChevronDown size={12} />
            </summary>
            <div className="call-qualification">
              <label>
                Group
                <select
                  aria-label={`Group for ${e.name}`}
                  value={group}
                  onChange={(ev) => edit("group", ev.target.value, e.group)}
                  disabled={failed}
                >
                  {Object.entries(groupLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
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
                    edit(
                      "visa",
                      ev.target.value,
                      e.visa === "some" ? "unknown" : e.visa,
                    )
                  }
                  disabled={failed}
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
                  onChange={(ev) =>
                    edit("pax", ev.target.value, e.travellers?.toString() || "")
                  }
                  disabled={failed}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={failed}
                onClick={() => {
                  if (
                    pax &&
                    (!Number.isInteger(Number(pax)) ||
                      Number(pax) < 1 ||
                      Number(pax) > 1000)
                  ) {
                    setMessage("Enter 1–1000 travellers.");
                    return;
                  }
                  void save({
                    type: "qualify",
                    group,
                    visa,
                    travellers: pax ? Number(pax) : null,
                    temperature: e.temperature,
                    availability: e.availability,
                  }).then((ok) => {
                    if (ok) {
                      calling.saved(e.id, "group", group);
                      calling.saved(e.id, "visa", visa);
                      calling.saved(e.id, "pax", pax);
                    }
                  });
                }}
              >
                Save details
              </Button>
            </div>
          </details>
        </div>
        <div className="call-priority">
          <select
            className="priority-number"
            aria-label={`Set priority for ${e.name}`}
            value={e.rank || ""}
            disabled={failed}
            title={
              e.rank
                ? `${e.override ? "Manual" : "Automatic"} priority: ${e.rankReason}`
                : "Needs qualification (NQ)"
            }
            onChange={(ev) =>
              void save(
                ev.target.value === "auto"
                  ? { type: "automaticPriority" }
                  : {
                      type: "override",
                      rank: ev.target.value as NonNullable<Enquiry["rank"]>,
                      reason: "Staff selected priority from the calling list.",
                    },
              )
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
            {e.override && isOpen(e) && (
              <option value="auto">Use automatic priority</option>
            )}
          </select>
          <small
            className="call-priority-source"
            title={
              e.override
                ? "Chosen manually. Select Use automatic priority to restore the trip rules."
                : "Calculated from this trip's group and visa rules."
            }
          >
            {e.override ? "Manual" : "Auto"}
          </small>
          <div className="call-trip">{tripName}</div>
          <small className="call-progress">
            {initialCallDone(e) ? "Initial call done" : "Not called"}
          </small>
        </div>
        <div className="call-colour-control">
          <span className="mobile-field-label">Call colour</span>
          {closed ? (
            <span className="call-outcome">
              <i />
              {converted ? "Converted · deposit received" : "Booking confirmed"}
            </span>
          ) : (
            <div
              className="call-colour-dots"
              role="group"
              aria-label={`Call colour for ${e.name}`}
            >
              {Object.entries(callColours).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={`call-colour-dot swatch-${key}`}
                  aria-label={`${label} for ${e.name}`}
                  title={label}
                  aria-pressed={e.callColour === key}
                  disabled={failed}
                  onClick={() => {
                    if (e.callColour === key) return;
                    void save({
                      type: "callColour",
                      colour: key as CallColour,
                    });
                    if (key === "red") onDisqualify();
                  }}
                >
                  <i />
                </button>
              ))}
            </div>
          )}
          {salesClosed && !closed && (
            <button
              type="button"
              className="calling-reopen"
              disabled={failed}
              onClick={() => void save({ type: "reopen" })}
            >
              Reopen enquiry
            </button>
          )}
        </div>
        <div className="call-note">
          <label>
            <span className="mobile-field-label">Note</span>
            <textarea
              aria-label={`Note for ${e.name}`}
              placeholder="Write the latest call note…"
              value={note}
              ref={(field) => {
                if (field) {
                  field.style.height = "44px";
                  field.style.height = `${Math.max(44, field.scrollHeight + 2)}px`;
                }
              }}
              onChange={(ev) => edit("note", ev.target.value, savedNote)}
              onBlur={() => void calling.flushDraft(e.id, "note")}
              maxLength={4000}
            />
          </label>
          {noteConflict && conflictControl("note", savedNote)}
        </div>
        <div className="call-actions">
          {!salesClosed && (
            <label>
              <span className="mobile-field-label">Follow-up</span>
              <DateTimeField
                type="datetime-local"
                pickerLabel={`Follow-up for ${e.name}`}
                aria-label={`Follow-up date for ${e.name}`}
                value={due}
                onChange={(ev) => edit("due", ev.target.value, savedDue)}
                onBlur={(ev) => {
                  if (!ev.currentTarget.validity.badInput)
                    calling.commitDue(e.id);
                }}
                onCommit={(value) => {
                  edit("due", value, savedDue);
                  calling.commitDue(e.id);
                }}
                disabled={failed}
              />
              <small
                className={
                  task && Date.parse(task.due) < Date.now()
                    ? "calling-overdue"
                    : ""
                }
              >
                {followupLabel(
                  due ? new Date(`${due}:00+04:00`).toISOString() : undefined,
                )}
              </small>
              <span className="calling-date-shortcuts">
                <button
                  type="button"
                  disabled={failed}
                  title="Tomorrow, keeping the selected time (Dubai)"
                  onClick={() => quickDate(1)}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  disabled={failed}
                  title="In 7 days, keeping the selected time (Dubai)"
                  onClick={() => quickDate(7)}
                >
                  Next week
                </button>
                {due && (
                  <button
                    type="button"
                    disabled={failed}
                    onClick={() => {
                      edit("due", "", savedDue);
                      calling.commitDue(e.id);
                    }}
                  >
                    Clear
                  </button>
                )}
              </span>
            </label>
          )}
          {!closed && (
            <Button
              type="submit"
              size="sm"
              className="call-save-icon"
              disabled={logging || failed}
              aria-label={
                initialCallDone(e) ? "Save call" : "Save initial call"
              }
              title="Record call attempt. Notes and dates save automatically."
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
          {dueConflict && conflictControl("due", savedDue)}
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
