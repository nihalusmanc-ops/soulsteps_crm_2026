import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type MouseEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import {
  money,
  isOpen,
  verifiedTotal,
  type State,
  type Trip,
} from "../shared/domain";
import { createTripSchema, type CreateTripInput } from "../shared/api";
import { Button } from "./components/ui/button";
import { Modal } from "./components/ui/modal";
import { DateTimeField } from "./components/ui/date-time-field";
import { EmptyState, useViewParam } from "./components/ui/workspace";
import { RuleManager, PublishTrip } from "./Management";
import { management } from "./data/management";
import type { useCrmWrites } from "./data/use-crm-writes";

type Props = {
  data: State;
  role: string;
  writes: ReturnType<typeof useCrmWrites>;
  run: (work: () => Promise<unknown>, message?: string) => Promise<boolean>;
  renderDelete: (trip: Trip) => ReactNode;
  stageLabels: Record<string, string>;
  error: string;
};
const statusLabel = {
  draft: "Draft",
  published: "Published",
  inactive: "Inactive",
};
function TripStatus({ trip }: { trip: Trip }) {
  return (
    <span className={`trip-status trip-status-${trip.status}`}>
      {statusLabel[trip.status]}
    </span>
  );
}
function departure(value: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Dubai",
      }).format(new Date(value + "T12:00:00+04:00"))
    : "Not set";
}

export function TripsWorkspace({
  data,
  role,
  writes,
  run,
  renderDelete,
  stageLabels,
  error,
}: Props) {
  const { id } = useParams();
  const navigate = useNavigate(),
    location = useLocation();
  const [search, setSearch] = useViewParam("q");
  const [status, setStatus] = useViewParam("status");
  const [sort, setSort] = useViewParam("sort", "departure");
  const [tab] = useViewParam("tab", "overview");
  function setTab(value: string) {
    const params = new URLSearchParams(location.search);
    if (value === "overview") params.delete("tab");
    else params.set("tab", value);
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true, state: location.state },
    );
  }
  const [editing, setEditing] = useState<Trip | null>(null),
    [creating, setCreating] = useState(false);
  const [rules, setRules] = useState<Trip | null>(null),
    [publishing, setPublishing] = useState<Trip | null>(null);
  const manager = role === "manager";
  const trip = data.trips.find((t) => t.id === id);
  const linked = (tripId: string) =>
    data.enquiries.filter((e) => e.tripId === tripId);
  const openCount = (tripId: string) => linked(tripId).filter(isOpen).length;
  const bookingCount = (tripId: string) =>
    linked(tripId).filter((e) => e.booking).length;
  const listUrl = location.pathname + location.search;
  const profileUrl = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;
  const returnTo =
    typeof location.state?.from === "string" &&
    /^\/trips(?:\?|$)/.test(location.state.from)
      ? location.state.from
      : "/trips";
  const filtered = data.trips
    .filter(
      (t) =>
        (!status || t.status === status) &&
        `${t.name} ${t.destination}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "enquiries")
        return (
          openCount(b.id) - openCount(a.id) || a.name.localeCompare(b.name)
        );
      return (
        (a.departure || "9999").localeCompare(b.departure || "9999") ||
        a.name.localeCompare(b.name)
      );
    });
  function openRow(event: MouseEvent<HTMLElement>, t: Trip) {
    if (
      (event.target as HTMLElement).closest(
        "a,button,input,select,summary,details",
      ) ||
      window.getSelection()?.toString()
    )
      return;
    if (event.ctrlKey || event.metaKey)
      window.open(profileUrl(t.id), "_blank", "noopener,noreferrer");
    else navigate(profileUrl(t.id), { state: { from: listUrl } });
  }
  function MoreActions({ t }: { t: Trip }) {
    return manager ? (
      <details
        className="trip-more-actions"
        name="trip-actions"
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            event.currentTarget.contains(event.target as Node)
          ) {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label={`More actions for ${t.name}`} title="More actions">
          <MoreHorizontal size={20} />
        </summary>
        <div className="trip-action-popover">{renderDelete(t)}</div>
      </details>
    ) : null;
  }

  const currentTab = ["overview", "enquiries", "bookings"].includes(tab)
    ? tab
    : "overview";
  const records = trip ? linked(trip.id) : [];
  const bookings = records.filter((e) => e.booking);
  return (
    <div className="trips-workspace">
      {id ? (
        trip ? (
          <>
            <Link className="back-link" to={returnTo}>
              <ArrowLeft size={15} />
              All trips
            </Link>
            <div className="trip-page-heading">
              <div>
                <div className="trip-page-kicker">
                  <MapPin size={15} />
                  {trip.destination || "Destination not set"}
                  <TripStatus trip={trip} />
                </div>
                <h1>{trip.name}</h1>
                <p className="muted">
                  {trip.type === "fixed"
                    ? "Fixed departure"
                    : "Bespoke journey"}
                </p>
              </div>
              {manager && (
                <div className="heading-actions">
                  <Button
                    disabled={writes.pending}
                    onClick={() => setEditing(trip)}
                  >
                    Edit trip details
                  </Button>
                  <MoreActions t={trip} />
                </div>
              )}
            </div>
            <div className="trip-summary-links">
              <div>
                <span>Departure</span>
                <strong>{departure(trip.departure)}</strong>
              </div>
              <div>
                <span>Price per person</span>
                <strong>
                  {trip.price === null ? "Not set" : money(trip.price)}
                </strong>
              </div>
              <Link
                to={`/enquiries?trip=${encodeURIComponent(trip.id)}&open=1`}
              >
                <span>
                  Open enquiries <ArrowRight size={14} />
                </span>
                <strong>{openCount(trip.id)}</strong>
              </Link>
              <Link
                to={`${profileUrl(trip.id)}?tab=bookings`}
                state={location.state}
              >
                <span>
                  Confirmed bookings <ArrowRight size={14} />
                </span>
                <strong>{bookings.length}</strong>
              </Link>
            </div>
            <div className="trip-tabs" aria-label="Trip sections">
              {["overview", "enquiries", "bookings"].map((t) => (
                <button
                  key={t}
                  aria-current={currentTab === t ? "page" : undefined}
                  onClick={() => setTab(t)}
                >
                  {t === "overview"
                    ? "Overview"
                    : t === "enquiries"
                      ? `Enquiries (${records.length})`
                      : `Bookings (${bookings.length})`}
                </button>
              ))}
            </div>
            {currentTab === "overview" ? (
              <div className="trip-overview-layout">
                <div className="trip-content-stack">
                  <section className="trip-content-panel">
                    <h2>About this trip</h2>
                    <p
                      className={`trip-prose ${!trip.description ? "muted" : ""}`}
                    >
                      {trip.description || "Not set"}
                    </p>
                  </section>
                  <section className="trip-content-panel">
                    <h2>Itinerary</h2>
                    <p
                      className={`trip-prose ${!trip.itinerary ? "muted" : ""}`}
                    >
                      {trip.itinerary || "Not set"}
                    </p>
                  </section>
                  <section className="trip-content-panel">
                    <h2>Availability</h2>
                    <p
                      className={`trip-prose ${!trip.availabilityNote ? "muted" : ""}`}
                    >
                      {trip.availabilityNote || "Not set"}
                    </p>
                    <p className="micro">
                      Staff confirm availability with the supplier before
                      booking.
                    </p>
                  </section>
                </div>
                <aside className="trip-content-panel trip-pricing">
                  <h2>Dates & pricing</h2>
                  <dl>
                    <div>
                      <dt>Departure</dt>
                      <dd>{departure(trip.departure)}</dd>
                    </div>
                    <div>
                      <dt>Price per person</dt>
                      <dd>
                        {trip.price === null ? "Not set" : money(trip.price)}
                      </dd>
                    </div>
                    <div>
                      <dt>Deposit</dt>
                      <dd>
                        {trip.deposit === null
                          ? "Not set"
                          : money(trip.deposit)}
                      </dd>
                    </div>
                    <div>
                      <dt>Journey type</dt>
                      <dd>{trip.type === "fixed" ? "Fixed" : "Bespoke"}</dd>
                    </div>
                  </dl>
                  <p className="micro">
                    Existing customers keep the amounts and terms in their
                    accepted quotations.
                  </p>
                </aside>
              </div>
            ) : (
              <section className="trip-content-panel">
                <div className="section-head">
                  <h2>
                    {currentTab === "bookings"
                      ? "Confirmed bookings"
                      : "Enquiries"}
                  </h2>
                  {currentTab === "enquiries" && (
                    <Link
                      className="trip-inline-link"
                      to={`/enquiries?trip=${encodeURIComponent(trip.id)}`}
                    >
                      Open enquiry list <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
                {(currentTab === "bookings" ? bookings : records).length ? (
                  <div className="trip-record-list">
                    {(currentTab === "bookings" ? bookings : records).map(
                      (e) => (
                        <Link
                          key={e.id}
                          to={`/enquiries/${encodeURIComponent(e.id)}${currentTab === "bookings" ? "?tab=payments" : ""}`}
                          state={{ from: location.pathname + location.search }}
                        >
                          <div>
                            <strong>{e.name}</strong>
                            <small>
                              {currentTab === "bookings"
                                ? e.booking?.reference
                                : stageLabels[e.stage]}
                            </small>
                          </div>
                          <div className="trip-record-end">
                            {currentTab === "bookings" ? (
                              <>
                                <strong>{money(e.quote?.total || 0)}</strong>
                                <small>
                                  {money(
                                    (e.quote?.total || 0) - verifiedTotal(e),
                                  )}{" "}
                                  outstanding
                                </small>
                              </>
                            ) : (
                              <span>
                                {e.temperature === "unassessed"
                                  ? "Interest not assessed"
                                  : `${e.temperature[0].toUpperCase() + e.temperature.slice(1)} interest`}
                              </span>
                            )}
                            <ChevronRight size={17} />
                          </div>
                        </Link>
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title={
                      currentTab === "bookings"
                        ? "No confirmed bookings yet"
                        : "No enquiries yet"
                    }
                  >
                    <p>
                      {currentTab === "bookings"
                        ? "Bookings appear after the deposit is verified and staff confirm the booking."
                        : "Enquiries linked to this trip will appear here."}
                    </p>
                  </EmptyState>
                )}
              </section>
            )}
            {manager && (
              <details className="trip-advanced">
                <summary>Advanced</summary>
                <div className="trip-advanced-grid">
                  <section>
                    <h3>Staff publication</h3>
                    <p>Review trip content for staff use.</p>
                    <Button
                      variant="outline"
                      disabled={writes.pending}
                      onClick={() => setPublishing(trip)}
                    >
                      Review publication
                    </Button>
                  </section>
                  <section>
                    <h3>Trip-fit rules</h3>
                    <p>Review how enquiries are ranked for this trip.</p>
                    <Button
                      variant="outline"
                      disabled={writes.pending}
                      onClick={() => setRules(trip)}
                    >
                      Preview fit rules
                    </Button>
                  </section>
                </div>
              </details>
            )}
          </>
        ) : (
          <EmptyState title="Trip not found">
            <p>This trip may have been deleted.</p>
            <Button asChild variant="outline">
              <Link to="/trips">All trips</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <div className="trip-page-heading">
            <div>
              <h1>Trips</h1>
              <p className="muted">Trip details, enquiries and bookings.</p>
            </div>
            {manager && (
              <Button
                disabled={writes.pending}
                onClick={() => setCreating(true)}
              >
                <Plus size={16} />
                New trip
              </Button>
            )}
          </div>
          <div className="trip-toolbar">
            <label className="trip-search">
              <Search size={17} />
              <input
                type="search"
                aria-label="Search trips"
                placeholder="Search trips or destinations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter trip status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              aria-label="Sort trips"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="departure">Departure</option>
              <option value="name">Trip name</option>
              <option value="enquiries">Most open enquiries</option>
            </select>
          </div>
          {filtered.length ? (
            <>
              <div className="trips-list-desktop">
                <table className="trips-list-table">
                  <thead>
                    <tr>
                      <th>Trip</th>
                      <th>Departure</th>
                      <th>Price / person</th>
                      <th>Open enquiries</th>
                      <th>Bookings</th>
                      <th>Status</th>
                      {manager && (
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} onClick={(event) => openRow(event, t)}>
                        <td>
                          <Link
                            className="trip-name-link"
                            to={profileUrl(t.id)}
                            state={{ from: listUrl }}
                          >
                            {t.name}
                          </Link>
                          <small>
                            {t.destination || "Not set"} ·{" "}
                            {t.type === "fixed" ? "Fixed" : "Bespoke"}
                          </small>
                        </td>
                        <td>{departure(t.departure)}</td>
                        <td>
                          {t.price === null ? (
                            <span className="muted">Not set</span>
                          ) : (
                            money(t.price)
                          )}
                        </td>
                        <td>
                          <Link
                            className="trip-count-link"
                            to={`/enquiries?trip=${encodeURIComponent(t.id)}&open=1`}
                          >
                            {openCount(t.id)}
                          </Link>
                        </td>
                        <td>
                          <Link
                            className="trip-count-link"
                            to={`${profileUrl(t.id)}?tab=bookings`}
                            state={{ from: listUrl }}
                          >
                            {bookingCount(t.id)}
                          </Link>
                        </td>
                        <td>
                          <TripStatus trip={t} />
                        </td>
                        {manager && (
                          <td>
                            <MoreActions t={t} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="trips-list-mobile">
                {filtered.map((t) => (
                  <article
                    key={t.id}
                    className="trip-mobile-item"
                    onClick={(event) => openRow(event, t)}
                  >
                    <div className="trip-mobile-heading">
                      <div>
                        <Link
                          className="trip-name-link"
                          to={profileUrl(t.id)}
                          state={{ from: listUrl }}
                        >
                          {t.name}
                        </Link>
                        <p className="muted">{t.destination || "Not set"}</p>
                      </div>
                      <MoreActions t={t} />
                    </div>
                    <div className="trip-mobile-facts">
                      <span>
                        <CalendarDays size={15} />
                        {departure(t.departure)}
                      </span>
                      <span>
                        {t.price === null
                          ? "Price not set"
                          : `${money(t.price)} / person`}
                      </span>
                    </div>
                    <div className="trip-mobile-footer">
                      <TripStatus trip={t} />
                      <Link
                        to={`/enquiries?trip=${encodeURIComponent(t.id)}&open=1`}
                      >
                        {openCount(t.id)} open{" "}
                        {openCount(t.id) === 1 ? "enquiry" : "enquiries"}
                      </Link>
                      <Link
                        to={`${profileUrl(t.id)}?tab=bookings`}
                        state={{ from: listUrl }}
                      >
                        {bookingCount(t.id)}{" "}
                        {bookingCount(t.id) === 1 ? "booking" : "bookings"}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              <p className="trip-list-caption">
                {filtered.length} {filtered.length === 1 ? "trip" : "trips"}
                {search || status ? ` of ${data.trips.length}` : ""}
              </p>
            </>
          ) : (
            <EmptyState
              title={data.trips.length ? "No matching trips" : "No trips yet"}
            >
              <p>
                {data.trips.length
                  ? "Try another search or status."
                  : manager
                    ? "Add your first trip to start collecting enquiries."
                    : "Your manager can add trips here."}
              </p>
              {(search || status) && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/trips", { replace: true })}
                >
                  Clear filters
                </Button>
              )}
            </EmptyState>
          )}
        </>
      )}
      {manager && (
        <>
          <Modal
            open={creating || !!editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            title={editing ? "Edit draft trip" : "Create draft trip"}
            description={
              editing
                ? "Changes are saved as a draft. Existing quotations keep their agreed terms."
                : "Add the details you have. You can complete the rest later."
            }
          >
            {(creating || editing) && (
              <TripEditor
                key={editing?.id || "new"}
                trip={editing}
                pending={writes.pending}
                saveError={writes.error?.message || error}
                onSave={async (input) => {
                  if (editing) {
                    const saved = await writes.saveTrip(
                      { ...editing, ...input },
                      () => setEditing(null),
                    );
                    if (saved) setEditing(null);
                    return saved;
                  }
                  let newId = "";
                  const saved = await run(async () => {
                    newId = (await management.createTrip(input)).id;
                  }, "Trip created");
                  if (saved) {
                    setCreating(false);
                    navigate(profileUrl(newId));
                  }
                  return saved;
                }}
              />
            )}
          </Modal>
          <Modal
            open={!!rules}
            onClose={() => setRules(null)}
            title="Trip-fit rule preview"
            description="Review affected enquiries before publishing the rules."
          >
            {rules && (
              <RuleManager tripId={rules.id} done={() => setRules(null)} />
            )}
          </Modal>
          <Modal
            open={!!publishing}
            onClose={() => setPublishing(null)}
            title="Review trip publication"
            description="Review trip content for manual staff use."
          >
            {publishing && (
              <PublishTrip trip={publishing} done={() => setPublishing(null)} />
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

function TripEditor({
  trip,
  pending,
  onSave,
  saveError,
}: {
  trip: Trip | null;
  pending: boolean;
  onSave: (input: Required<CreateTripInput>) => Promise<boolean>;
  saveError: string;
}) {
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || pending) return;
    const form = new FormData(event.currentTarget),
      value = (key: string) => String(form.get(key) || "");
    const parsed = createTripSchema.safeParse({
      name: value("name"),
      destination: value("destination"),
      type: value("type"),
      description: value("description"),
      departure: value("departure"),
      availabilityNote: value("availabilityNote"),
      itinerary: value("itinerary"),
      price: value("price") ? Math.round(Number(value("price")) * 100) : null,
      deposit: value("deposit")
        ? Math.round(Number(value("deposit")) * 100)
        : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setFailed(false);
    try {
      if (!(await onSave(parsed.data))) setFailed(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The trip could not be saved. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="trip-editor" onSubmit={submit}>
      <fieldset disabled={busy || pending}>
        <legend>Trip details</legend>
        <label>
          Trip name
          <input
            name="name"
            required
            maxLength={150}
            defaultValue={trip?.name || ""}
          />
        </label>
        <div className="form-grid">
          <label>
            Destination
            <input
              name="destination"
              required
              maxLength={150}
              defaultValue={trip?.destination || ""}
            />
          </label>
          <label>
            Journey type
            <select
              name="type"
              aria-label="Journey type"
              defaultValue={trip?.type || "fixed"}
            >
              <option value="fixed">Fixed</option>
              <option value="bespoke">Bespoke</option>
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            maxLength={8000}
            rows={3}
            defaultValue={trip?.description || ""}
          />
        </label>
      </fieldset>
      <fieldset disabled={busy || pending}>
        <legend>Dates & pricing</legend>
        <label>
          Departure date
          <DateTimeField
            type="date"
            name="departure"
            pickerLabel="Departure date"
            defaultValue={trip?.departure || ""}
          />
        </label>
        <div className="form-grid">
          <label>
            Price per person · AED
            <input
              type="number"
              name="price"
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={trip?.price ? trip.price / 100 : ""}
            />
          </label>
          <label>
            Deposit · AED
            <input
              type="number"
              name="deposit"
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={trip?.deposit ? trip.deposit / 100 : ""}
            />
          </label>
        </div>
        <p className="micro">Leave amounts blank until confirmed.</p>
      </fieldset>
      <fieldset disabled={busy || pending}>
        <legend>Itinerary & availability</legend>
        <label>
          Itinerary
          <textarea
            name="itinerary"
            maxLength={20000}
            rows={5}
            defaultValue={trip?.itinerary || ""}
          />
        </label>
        <label>
          Availability note
          <textarea
            name="availabilityNote"
            maxLength={4000}
            rows={3}
            defaultValue={trip?.availabilityNote || ""}
          />
        </label>
      </fieldset>
      {(error || failed) && (
        <p role="alert" className="error-banner">
          {error || saveError || "The trip could not be saved. Try again."}
        </p>
      )}
      <div className="trip-editor-footer">
        <Button type="submit" disabled={busy || pending}>
          {busy || pending
            ? "Saving…"
            : trip
              ? "Save draft trip"
              : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
