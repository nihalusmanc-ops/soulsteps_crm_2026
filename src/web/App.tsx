import { selfDrivePreference } from "../shared/domain";
import { CallingWorkspace } from "./CallingWorkspace";
import { callColours, currentNote, type CallColour } from "../shared/calling";
import {
  LeadNotesDrawer,
  LeadNoteCard,
  WorkbookBadge,
  SourceFollowup,
  clientNote,
  enquiryText,
} from "./LeadNotes";
import { leadColourLabels } from "../shared/workbook-context";
import { DateTimeField } from "./components/ui/date-time-field";
import {
  Metric,
  ViewSwitch,
  LoadingWorkspace,
  EmptyState,
  useViewParam,
} from "./components/ui/workspace";
import { TripsWorkspace } from "./TripsWorkspace";
import { LoginPage } from "./LoginPage";
import { AccountSecurity } from "./AccountSecurity";
import { ProfileMenu } from "./ProfileMenu";
import { SettingsPage } from "./SettingsPage";
import { DueReminders } from "./DueReminders";
import { useWorkspace } from "./data/management";
import { Settings as SettingsIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useSearchParams,
  useParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCrmWrites } from "./data/use-crm-writes";
import type { CustomerSummary } from "../shared/api";
import { request } from "./data/api";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  LayoutDashboard,
  ListFilter,
  ListTodo,
  Map,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Modal } from "./components/ui/modal";
import { apiRepository as repository, session, reports } from "./data/api";
import { FilesPanel } from "./FilesPanel";
import {
  stages,
  money,
  dateTime,
  dubaiDay,
  nextTask,
  isOpen,
  verifiedTotal,
  confirmationBlock,
  classify,
  manualWhatsAppUrl,
  type Command,
  type Enquiry,
  type Stage,
  type State,
} from "../shared/domain";
const Context = createContext<{
  data: State;
  run: (work: () => Promise<unknown>, message?: string) => Promise<boolean>;
  role: string;
  error: string;
  writes: ReturnType<typeof useCrmWrites>;
}>({} as never);
const useCRM = () => useContext(Context);
function DeleteRecord({
  kind,
  id,
  name,
  revision,
  blocked,
}: {
  kind: "trip" | "enquiry";
  id: string;
  name: string;
  revision: number;
  blocked?: string;
}) {
  const { role, error, writes } = useCRM();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  if (role !== "manager") return null;
  return (
    <>
      <Button
        variant="ghost"
        disabled={writes.pending}
        onClick={() => setOpen(true)}
      >
        Delete {kind}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={`Delete ${kind}?`}
        description={name}
      >
        {blocked ? (
          <>
            <p>{blocked}</p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              setPending(true);
              const leave = () => {
                setOpen(false);
                navigate(kind === "trip" ? "/trips" : "/enquiries");
              };
              const success = await writes.remove(kind, id, revision, leave);
              setPending(false);
              if (success) {
                leave();
              }
            }}
          >
            <p>
              This removes the {kind} from the workspace. History is retained
              for audit.
              {kind === "enquiry"
                ? " Pending follow-ups will be cancelled. The customer record and other enquiries are kept."
                : " Enquiries linked to this trip must be removed first."}
            </p>
            {error && (
              <p role="alert" className="error-banner">
                {error}
              </p>
            )}
            <label className="checkbox">
              <input type="checkbox" required disabled={pending} />I confirm I
              want to delete this {kind}.
            </label>
            <div className="modal-actions">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Deleting…" : `Delete ${kind}`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
function useStageLabels() {
  const cfg = useWorkspace();
  return Object.fromEntries(
    Object.entries(cfg.settings.stages).map(([code, value]) => [
      code,
      value.label,
    ]),
  ) as typeof stages;
}
const nav = [
  { to: "/", label: "Enquiries", icon: Users },
  { to: "/trips", label: "Trips", icon: Map },
  { to: "/bookings", label: "Bookings", icon: Wallet },
  { to: "/overview", label: "Overview", icon: Compass },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];
function Badge({
  children,
  kind = "",
}: {
  children: ReactNode;
  kind?: string;
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
function StageBadge({ stage }: { stage: Stage }) {
  const cfg = useWorkspace();
  const label = cfg.settings.stages[stage];
  return (
    <span
      className="badge"
      style={{
        color: "var(--text)",
        background: "#fff",
        border: `1px solid ${label.color}33`,
      }}
    >
      <i style={{ background: label.color }} />
      {label.label}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name.replace("Demo Traveller ", "").slice(0, 2)}
    </span>
  );
}
function Empty({
  title = "Nothing here just yet",
  text = "Try adjusting your filters or adding a new enquiry.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <EmptyState title={title}>
      <p>{text}</p>
    </EmptyState>
  );
}
function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Stat({
  label,
  value,
  foot,
  accent = "",
}: {
  label: string;
  value: ReactNode;
  foot: string;
  accent?: string;
}) {
  return (
    <div className={`stat ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {foot && <small>{foot}</small>}
    </div>
  );
}
export default function App() {
  const loginOptions = useQuery({
    queryKey: ["auth-options"],
    queryFn: session.options,
    retry: false,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: session.me, retry: false });
  const actionLock = useRef(false);
  const writes = useCrmWrites(me.data, () => actionLock.current);
  const [loginBusy, setLoginBusy] = useState(false),
    [loginError, setLoginError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const query = useQuery({
    queryKey: ["crm", me.data?.id],
    queryFn: ({ signal }) => repository.read(signal),
    refetchOnWindowFocus: !writes.pending && !actionPending,
    refetchOnReconnect: !writes.pending && !actionPending,
    enabled: !!me.data,
  });
  const client = useQueryClient();
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!writes.succeeded) return;
    setToast("Saved");
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [writes.succeeded]);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const role = me.data?.role || "staff";
  const [create, setCreate] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSearchTerm(customerSearch.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [customerSearch]);
  const customers = useQuery({
    queryKey: ["customers", me.data?.id, searchTerm],
    queryFn: ({ signal }) =>
      request<CustomerSummary[]>(
        `/customers?q=${encodeURIComponent(searchTerm)}`,
        { signal },
      ),
    enabled: !!me.data && create && !!searchTerm,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const currentPage =
    nav.find((n) =>
      n.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(n.to),
    )?.label ||
    (location.pathname.startsWith("/enquiries")
      ? "Enquiries"
      : location.pathname === "/today"
        ? "Daily summary"
        : "Workspace");
  useEffect(() => {
    document.title =
      (loginOptions.data?.method === "password" && (me.isError || !me.data)
        ? "Sign in"
        : location.pathname === "/account/security"
          ? "Account security"
          : currentPage) + " | Soulsteps CRM";
    if (loginOptions.data?.method === "password" && me.isError)
      setMobile(false);
  }, [
    currentPage,
    location.pathname,
    loginOptions.data?.method,
    me.isError,
    me.data?.id,
  ]);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        navigationRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button, select",
        ) || [],
      );
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
      if (event.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onResize = () => {
      if (window.innerWidth > 760) setMobile(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      menuRef.current?.focus();
    };
  }, [mobile]);
  async function run(work: () => Promise<unknown>, message = "Saved") {
    if (writes.locked() || actionLock.current) {
      setError("Please wait for the current save to finish.");
      return false;
    }
    actionLock.current = true;
    setActionPending(true);
    setError("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["crm"] });
      setToast(message);
      setError("");
      window.setTimeout(() => setToast(""), 4500);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      await client.invalidateQueries({ queryKey: ["crm"] });
      return false;
    } finally {
      actionLock.current = false;
      setActionPending(false);
    }
  }
  if (loginOptions.data?.method === "password" && (me.isError || !me.data)) {
    if (me.isPending) return <LoadingWorkspace />;
    return (
      <LoginPage
        method="password"
        busy={loginBusy}
        error={loginError}
        onSubmit={async (fields) => {
          setLoginBusy(true);
          setLoginError("");
          try {
            const identity = await session.login(fields.email, fields.password);
            client.removeQueries({
              predicate: (q) =>
                !["me", "auth-options"].includes(String(q.queryKey[0])),
            });
            client.setQueryData(["me"], identity);
            navigate(
              location.pathname === "/login"
                ? "/"
                : location.pathname + location.search,
              { replace: true },
            );
          } catch (error) {
            setLoginError(
              error instanceof Error
                ? error.message
                : "Sign-in could not be completed. Please try again.",
            );
          } finally {
            setLoginBusy(false);
          }
        }}
      />
    );
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button
          className="navigation-scrim"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        aria-label="Workspace navigation"
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        className={`sidebar ${mobile ? "visible" : ""}`}
      >
        {mobile && (
          <button
            className="icon-button nav-close"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        )}
        <Link to="/" className="brand" aria-label="Soulsteps home">
          <img
            className="brand-full-logo"
            src="/brand/soulsteps-logo.png"
            width="1536"
            height="946"
            alt="Soulsteps"
          />
        </Link>
        <nav aria-label="Main navigation">
          {nav
            .filter((n) => role === "manager" || n.to !== "/overview")
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  isActive ||
                  (n.to === "/" && location.pathname.startsWith("/enquiries"))
                    ? "active"
                    : undefined
                }
                onClick={() => setMobile(false)}
              >
                <n.icon size={19} />
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {me.data && (
            <ProfileMenu
              identity={me.data}
              onNavigate={() => setMobile(false)}
              onSignOut={async () => {
                try {
                  await session.logout();
                  client.removeQueries({
                    predicate: (q) => q.queryKey[0] !== "auth-options",
                  });
                  navigate("/");
                  await me.refetch();
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not sign out. Try again.",
                  );
                }
              }}
            />
          )}
          {me.data?.local && (
            <div className="demo-identity-control">
              {" "}
              <select
                aria-label="Local demo identity"
                value={role}
                onChange={async (e) => {
                  try {
                    await session.switchLocal(e.target.value);
                    client.removeQueries({
                      predicate: (q) => q.queryKey[0] !== "me",
                    });
                    await client.invalidateQueries({ queryKey: ["me"] });
                    navigate("/");
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Could not switch local identity",
                    );
                  }
                }}
              >
                <option value="manager">Local demo manager</option>
                <option value="staff">Local demo staff</option>
              </select>
            </div>
          )}
        </div>
      </aside>
      <div className="main-shell" inert={mobile}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            ref={menuRef}
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
          <span className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{currentPage}</strong>
          </span>
        </header>
        {me.data?.local && (
          <div className="demo-banner">
            Demo data · No customer messages sent
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {(writes.pending || actionPending) && (
            <div role="status" className="notice">
              Saving changes…
            </div>
          )}
          {writes.error && (
            <div role="alert" className="error-banner">
              <span>
                {writes.error.message} Please review the record or retry the
                save.
              </span>
              {writes.retryable && (
                <Button variant="ghost" onClick={() => writes.retry()}>
                  Retry save
                </Button>
              )}
              <Button variant="ghost" onClick={() => writes.reset()}>
                Dismiss
              </Button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {me.isError ? (
            <div className="panel">
              <Empty title="Staff access unavailable" text={me.error.message} />
              <Button onClick={() => me.refetch()}>Retry login</Button>
            </div>
          ) : query.isPending ? (
            <LoadingWorkspace />
          ) : query.isError ? (
            <div className="panel">
              <Empty
                title="Could not load CRM data"
                text={query.error.message}
              />
              <Button onClick={() => query.refetch()}>Try again</Button>
            </div>
          ) : (
            <Context.Provider
              value={{ data: query.data, run, role, error, writes }}
            >
              <Routes>
                <Route path="/account/security" element={<AccountSecurity />} />
                <Route
                  path="/settings"
                  element={
                    me.data ? (
                      <SettingsPage
                        identity={me.data}
                        trips={query.data.trips}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/"
                  element={<Enquiries onCreate={() => setCreate(true)} />}
                />
                <Route
                  path="/enquiries"
                  element={<Enquiries onCreate={() => setCreate(true)} />}
                />
                <Route
                  path="/today"
                  element={<Today onCreate={() => setCreate(true)} />}
                />
                <Route
                  path="/enquiries/:id"
                  element={<Detail key={location.pathname} />}
                />
                <Route path="/trips" element={<Trips />} />
                <Route
                  path="/trips/:id"
                  element={<Trips key={location.pathname} />}
                />
                <Route path="/bookings" element={<Bookings />} />
                <Route
                  path="/overview"
                  element={
                    role === "manager" ? (
                      <Overview />
                    ) : (
                      <Empty
                        title="Manager view"
                        text="Manager reports require a manager identity."
                      />
                    )
                  }
                />
                <Route
                  path="*"
                  element={
                    <Empty
                      title="Page not found"
                      text="Choose a page from the workspace navigation."
                    />
                  }
                />
              </Routes>
              <Modal
                open={create}
                onClose={() => {
                  setCreate(false);
                  setExistingCustomer("");
                  setCustomerSearch("");
                }}
                title="New enquiry"
                description="Choose an existing customer or add someone new."
              >
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    let id = "";
                    if (
                      await run(async () => {
                        id = await repository.create(
                          String(
                            f.get("name") ||
                              customers.data?.find(
                                (e) => e.id === existingCustomer,
                              )?.name ||
                              "",
                          ),
                          String(f.get("trip")),
                          existingCustomer || undefined,
                          {
                            email: String(f.get("email") || "").trim(),
                            phone: String(f.get("phone") || "").trim(),
                          },
                          {
                            group: String(f.get("group")) as Enquiry["group"],
                            visa: String(f.get("visa")) as
                              "all" | "none" | "unknown",
                            travellers: f.get("travellers")
                              ? Number(f.get("travellers"))
                              : null,
                          },
                        );
                      })
                    ) {
                      setCreate(false);
                      setExistingCustomer("");
                      setCustomerSearch("");
                      navigate(`/enquiries/${id}`);
                    }
                  }}
                >
                  <label>
                    Search existing customers
                    <input
                      type="search"
                      value={customerSearch}
                      maxLength={100}
                      placeholder="Name, phone or email"
                      onChange={(event) => {
                        setCustomerSearch(event.target.value);
                        setExistingCustomer("");
                      }}
                      aria-controls="customer-search-results"
                    />
                  </label>
                  {existingCustomer ? (
                    <div className="notice">
                      Selected:{" "}
                      {
                        customers.data?.find((e) => e.id === existingCustomer)
                          ?.name
                      }{" "}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setExistingCustomer("");
                          setCustomerSearch("");
                        }}
                      >
                        Use a new customer
                      </Button>
                    </div>
                  ) : (
                    customerSearch.trim() && (
                      <div
                        id="customer-search-results"
                        className="customer-search-results"
                        aria-label="Matching customers"
                      >
                        {(() => {
                          if (
                            searchTerm !== customerSearch.trim() ||
                            customers.isFetching
                          )
                            return <p role="status">Searching…</p>;
                          if (customers.isError)
                            return (
                              <p role="alert">
                                Customer search failed.{" "}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => customers.refetch()}
                                >
                                  Try again
                                </Button>
                              </p>
                            );
                          const matches = customers.data || [];
                          return matches.length ? (
                            <>
                              <p className="micro">
                                {matches.length} matching{" "}
                                {matches.length === 1
                                  ? "customer"
                                  : "customers"}
                              </p>
                              {matches.slice(0, 20).map((e) => (
                                <Button
                                  key={e.id}
                                  type="button"
                                  variant="outline"
                                  onClick={() => setExistingCustomer(e.id)}
                                >
                                  <span>
                                    {e.name}
                                    <small>
                                      {e.phone ||
                                        e.email ||
                                        "No contact details"}
                                    </small>
                                  </span>
                                </Button>
                              ))}
                            </>
                          ) : (
                            <p role="status" className="micro">
                              No matching customer. Add their details below.
                            </p>
                          );
                        })()}
                      </div>
                    )
                  )}
                  <label>
                    Customer name
                    <input
                      name="name"
                      required={!existingCustomer}
                      disabled={!!existingCustomer}
                      maxLength={100}
                      placeholder="Full name"
                    />
                  </label>
                  {!existingCustomer && (
                    <div className="form-grid">
                      <label>
                        Email
                        <input name="email" type="email" maxLength={254} />
                      </label>
                      <label>
                        Phone
                        <input
                          name="phone"
                          type="tel"
                          pattern="[+][1-9][0-9]{7,14}"
                          placeholder="Include country code"
                        />
                      </label>
                    </div>
                  )}
                  <label>
                    Trip
                    <select name="trip" required aria-label="Trip">
                      <option value="">Choose a trip</option>
                      {query.data.trips.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      Travel party
                      <select name="group" defaultValue="unknown">
                        <option value="unknown">Not set</option>
                        <option value="couple">Couple</option>
                        <option value="solo">Solo</option>
                        <option value="family">Family</option>
                        <option value="friends">Friends</option>
                      </select>
                    </label>
                    <label>
                      Schengen
                      <select name="visa" defaultValue="unknown">
                        <option value="unknown">Not set</option>
                        <option value="all">Yes</option>
                        <option value="none">No</option>
                      </select>
                    </label>
                    <label>
                      Number of travellers
                      <input
                        name="travellers"
                        type="number"
                        min="1"
                        max="1000"
                      />
                    </label>
                  </div>
                  <Button
                    type="submit"
                    disabled={writes.pending || actionPending}
                  >
                    {actionPending ? "Creating enquiry…" : "Create enquiry"}
                  </Button>
                  {error && (
                    <p role="alert" className="error-banner">
                      {error}
                    </p>
                  )}
                </form>
              </Modal>
            </Context.Provider>
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Customer({ e }: { e: Enquiry }) {
  const location = useLocation();
  return (
    <Link
      className="customer"
      to={`/enquiries/${e.id}`}
      state={{ from: location.pathname + location.search }}
    >
      <Avatar name={e.name} />
      <span>
        <strong>{e.name}</strong>
        <WorkbookBadge e={e} />
        <small>
          {e.group} · {e.travellers ?? "Unknown"} traveller
          {e.travellers === 1 ? "" : "s"}
        </small>
      </span>
    </Link>
  );
}
function Fit({ e }: { e: Enquiry }) {
  return (
    <div className="fit">
      <Badge kind={e.rank ? "rank" : "qualification"}>
        {e.rank || "Needs qualification"}
      </Badge>
      <span className={`temperature ${e.temperature}`}>
        <i />
        {e.temperature}
      </span>
    </div>
  );
}
function Today({ onCreate }: { onCreate: () => void }) {
  const { data } = useCRM();
  const [tab, setTab] = useViewParam("queue", "overdue");
  const now = new Date();
  const open = data.enquiries.filter(isOpen);
  const tasks = open
    .flatMap((e) =>
      e.tasks.filter((t) => t.status === "pending").map((t) => ({ e, t })),
    )
    .sort((a, b) => a.t.due.localeCompare(b.t.due));
  const overdue = tasks.filter(({ t }) => new Date(t.due) < now);
  const upcoming = tasks.filter(({ t }) => new Date(t.due) >= now);
  const actionless = open.filter((e) => !nextTask(e));
  const ready = open.filter(
    (e) => e.temperature === "hot" || (e.quote && !confirmationBlock(e)),
  );
  const newLeads = open.filter((e) => e.temperature === "unassessed");
  const prospects = actionless
    .filter((e) => e.temperature !== "unassessed")
    .sort(
      (a, b) =>
        ["hot", "warm", "cold"].indexOf(a.temperature) -
          ["hot", "warm", "cold"].indexOf(b.temperature) ||
        (a.rank || "P9").localeCompare(b.rank || "P9") ||
        (a.lastContact || a.createdAt).localeCompare(
          b.lastContact || b.createdAt,
        ),
    );
  const deposits = open.filter(
    (e) =>
      e.quote?.accepted &&
      e.quote.deposit &&
      verifiedTotal(e) < e.quote.deposit,
  );
  const departures = data.trips
    .filter(
      (t) =>
        t.departure && t.departure >= dubaiDay() && t.status !== "inactive",
    )
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const list =
    tab === "overdue"
      ? overdue
      : tab === "scheduled"
        ? upcoming
        : (tab === "missing"
            ? actionless
            : tab === "deposits"
              ? deposits
              : tab === "ready"
                ? ready
                : tab === "prospecting"
                  ? prospects
                  : newLeads
          ).map((e) => ({ e, t: nextTask(e) }));
  return (
    <>
      <Heading title="Today">
        <Button onClick={onCreate}>
          <Plus size={17} />
          New enquiry
        </Button>
      </Heading>
      <p className="page-context">
        {now.toLocaleDateString("en-GB", {
          timeZone: "Asia/Dubai",
          weekday: "long",
          day: "numeric",
          month: "long",
        })}{" "}
        · Your next actions, in one place
      </p>
      <div className="stats">
        <Metric
          label="Overdue follow-ups"
          value={overdue.length}
          foot="Review oldest commitments"
          to="/?queue=overdue"
          warning
        />
        <Metric
          label="New / unassessed"
          value={newLeads.length}
          foot="Start a conversation"
          to="/?queue=new"
        />
        <Metric
          label="Upcoming follow-ups"
          value={upcoming.length}
          foot="Scheduled · Dubai time"
          to="/?queue=scheduled"
        />
        <Metric
          label="Outstanding deposits"
          value={deposits.length}
          foot="Accepted quotes · funds still needed"
          to="/?queue=deposits"
        />
      </div>
      <div className="today-grid">
        <section className="panel queue-panel">
          <div className="section-head">
            <div>
              <h2>Follow-ups</h2>
            </div>
            <span className="subtle">
              <Clock3 size={14} />
              {tab === "prospecting"
                ? "Interest · fit · oldest contact"
                : ["overdue", "scheduled"].includes(tab)
                  ? "Due time first"
                  : "Open enquiries"}
            </span>
          </div>
          <ViewSwitch
            label="Action queues"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overdue", label: "Overdue", count: overdue.length },
              {
                value: "scheduled",
                label: "Scheduled",
                count: upcoming.length,
              },
              {
                value: "new",
                label: "New / unassessed",
                count: newLeads.length,
              },
              { value: "ready", label: "Ready to book", count: ready.length },
              { value: "deposits", label: "Deposits", count: deposits.length },
              {
                value: "missing",
                label: "No next action",
                count: actionless.length,
              },
              {
                value: "prospecting",
                label: "Prospecting",
                count: prospects.length,
              },
            ]}
          />
          {tab === "ready" && (
            <p className="queue-explanation">
              Hot buying interest or a verified deposit. Review the enquiry
              before confirming.
            </p>
          )}
          <div className="queue">
            {list.length ? (
              list.map(({ e, t }) => (
                <div className="queue-row" key={t?.id || e.id}>
                  <div className="queue-person">
                    <Customer e={e} />
                    <div className="row-meta">
                      <StageBadge stage={e.stage} />
                      <span>
                        {e.response !== "none"
                          ? e.response.replaceAll("_", " ")
                          : data.trips.find((t) => t.id === e.tripId)
                              ?.destination || "Trip unqualified"}
                      </span>
                    </div>
                  </div>
                  <div className="queue-action">
                    <strong>
                      {tab === "deposits"
                        ? `Deposit: ${money(Math.max(0, (e.quote?.deposit || 0) - verifiedTotal(e)))} remaining`
                        : t?.type ||
                          (e.quote && !confirmationBlock(e)
                            ? "Confirm booking"
                            : "Plan the next step")}
                    </strong>
                    <small
                      className={
                        t && new Date(t.due) < now ? "overdue-text" : ""
                      }
                    >
                      {t ? dateTime(t.due) : "No accepted appointment"}
                    </small>
                    <Fit e={e} />
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to={`/enquiries/${e.id}`}
                      state={{ from: "/?queue=" + tab }}
                    >
                      Open <ArrowRight size={14} />
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <Empty
                title="All clear here"
                text="Choose another queue to plan your next conversation."
              />
            )}
          </div>
          <Link className="panel-link" to="/enquiries">
            View all {data.enquiries.length} enquiries <ArrowRight size={16} />
          </Link>
        </section>
        <aside className="today-aside">
          <DueReminders />
          <div className="panel compact">
            <div className="section-head">
              <h3>Needs your attention</h3>
              <span className="count">{actionless.length}</span>
            </div>
            {actionless.slice(0, 3).map((e) => (
              <Link
                className="attention-row"
                to={`/enquiries/${e.id}`}
                key={e.id}
              >
                <span>
                  <strong>{e.name}</strong>
                  <small>
                    {e.requestedCallback
                      ? `Requested: ${e.requestedCallback}`
                      : "Set a clear next action"}
                  </small>
                </span>
                <ChevronRight size={17} />
              </Link>
            ))}
            {!actionless.length && (
              <p className="micro">Every open enquiry has a next action.</p>
            )}
            <Link className="panel-link" to="/?queue=missing">
              View all {actionless.length} <ArrowRight size={15} />
            </Link>
          </div>
          <section className="panel compact">
            <div className="section-head">
              <h3>Upcoming departures</h3>
              <CalendarDays size={18} />
            </div>
            {departures.length ? (
              departures.slice(0, 3).map((t) => (
                <Link className="attention-row" key={t.id} to="/trips">
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.departure} ·{" "}
                      {t.status === "draft" ? "Draft date" : "Published"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </Link>
              ))
            ) : (
              <p className="micro">No upcoming departure dates recorded.</p>
            )}
            <Link className="panel-link" to="/trips">
              View trips <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
function Enquiries({ onCreate }: { onCreate: () => void }) {
  const { data, writes } = useCRM();
  const [params] = useSearchParams();
  if (params.get("view") === "pipeline")
    return <LegacyEnquiries onCreate={onCreate} />;
  return (
    <>
      <CallingWorkspace data={data} writes={writes} onCreate={onCreate} />
      <details className="calling-other-views">
        <summary>More views</summary>
        <Link to="/today">Daily summary</Link>
        <Link to="/enquiries?view=pipeline">Sales pipeline</Link>
      </details>
    </>
  );
}
function LegacyEnquiries({ onCreate }: { onCreate: () => void }) {
  const [notesFor, setNotesFor] = useState<Enquiry | null>(null);
  const notesTrigger = useRef<HTMLButtonElement | null>(null);
  const [clientStatus, setClientStatus] = useViewParam("clientStatus", "");
  const stages = useStageLabels();
  const { data } = useCRM();
  const location = useLocation();
  const [, setParams] = useSearchParams();
  const [q, setQ] = useViewParam("q");
  const [stage, setStage] = useViewParam("stage", "");
  const [temp, setTemp] = useViewParam("interest", "");
  const [rank, setRank] = useViewParam("fit", "");
  const [view, setView] = useViewParam("view", "table");
  const [extra, setExtra] = useState(false);
  const [visa, setVisa] = useViewParam("visa", "");
  const [group, setGroup] = useViewParam("group", "");
  const [source, setSource] = useViewParam("source", "");
  const [sourceSection, setSourceSection] = useViewParam("sourceSection", "");
  const [missingValue, setMissingValue] = useViewParam("missing");
  const [responseValue, setResponseValue] = useViewParam("response");
  const missing = missingValue === "1",
    response = responseValue === "1";
  const setMissing = (v: boolean) => setMissingValue(v ? "1" : "");
  const setResponse = (v: boolean) => setResponseValue(v ? "1" : "");
  const [tripFilter, setTripFilter] = useViewParam("trip");
  const [since] = useViewParam("since");
  const [paidSince] = useViewParam("paidSince");
  const [openOnly] = useViewParam("open");
  const clearFilters = () =>
    setParams(view === "pipeline" ? { view: "pipeline" } : {}, {
      replace: true,
    });
  const activeFilters = [
    q,
    stage,
    temp,
    rank,
    visa,
    group,
    source,
    sourceSection,
    clientStatus,
    missing,
    response,
    tripFilter,
    since,
    paidSince,
    openOnly,
  ].filter(Boolean).length;
  const [sort, setSort] = useViewParam("sort", "created");
  const filtered = data.enquiries
    .filter(
      (e) =>
        `${e.name} ${e.email} ${e.phone || ""}`
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (!sourceSection || e.sourceSections?.includes(sourceSection)) &&
        (!clientStatus || e.workbook?.colour === clientStatus) &&
        (!paidSince ||
          e.payments.some(
            (p) => p.status === "verified" && p.date >= paidSince,
          )) &&
        (!openOnly || isOpen(e)) &&
        (!tripFilter || e.tripId === tripFilter) &&
        (!since || e.createdAt >= since) &&
        (!stage || e.stage === stage) &&
        (!temp || e.temperature === temp) &&
        (!rank || (e.rank || "needs") === rank) &&
        (!visa || e.visa === visa) &&
        (!group || e.group === group) &&
        (!source || e.source === source) &&
        (!missing || (isOpen(e) && !nextTask(e))) &&
        (!response || e.response !== "none"),
    )
    .sort((a, b) =>
      sort === "due"
        ? (nextTask(a)?.due || "z").localeCompare(nextTask(b)?.due || "z")
        : sort === "interest"
          ? ["hot", "warm", "cold", "unassessed"].indexOf(a.temperature) -
              ["hot", "warm", "cold", "unassessed"].indexOf(b.temperature) ||
            (a.rank || "P9").localeCompare(b.rank || "P9") ||
            (a.lastContact || a.createdAt).localeCompare(
              b.lastContact || b.createdAt,
            )
          : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <LeadNotesDrawer
        enquiry={notesFor}
        onClose={() => setNotesFor(null)}
        returnFocus={notesTrigger}
      />
      <Heading title="Enquiries">
        <Button onClick={onCreate}>
          <Plus size={17} />
          New enquiry
        </Button>
      </Heading>
      <section className="panel">
        <div className="filterbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search enquiries"
              placeholder="Search name or contact…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">All stages</option>
            {Object.entries(stages).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter interest"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
          >
            <option value="">All interest</option>
            {["hot", "warm", "cold", "unassessed"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Filter priority"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
          >
            <option value="">All trip fit</option>
            {["P1", "P2", "P3", "P4", "P5", "P6"].map((v) => (
              <option key={v}>{v}</option>
            ))}
            <option value="needs">Needs qualification</option>
          </select>
          <Button
            variant="outline"
            aria-expanded={extra}
            aria-controls="enquiry-filters"
            onClick={() => setExtra(!extra)}
          >
            <ListFilter size={16} />
            More filters
          </Button>
        </div>
        {extra && (
          <div className="extra-filters" id="enquiry-filters">
            <select
              aria-label="Filter lead status"
              value={clientStatus}
              onChange={(e) => setClientStatus(e.target.value)}
            >
              <option value="">All client statuses</option>
              {Object.entries(leadColourLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter trip"
              value={tripFilter}
              onChange={(e) => setTripFilter(e.target.value)}
            >
              <option value="">All trips</option>
              {data.trips.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter visa"
              value={visa}
              onChange={(e) => setVisa(e.target.value)}
            >
              <option value="">All visas</option>
              {["all", "none", "some", "unknown"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">All groups</option>
              {["couple", "solo", "family", "friends", "unknown"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">All sources</option>
              {Array.from(
                new Set([
                  "Facebook",
                  "Instagram",
                  "Manual",
                  ...data.enquiries.map((e) => e.source),
                ]),
              ).map((v) => (
                <option key={v} value={v}>
                  {enquiryText(v)}
                </option>
              ))}
            </select>
            {data.enquiries.some((e) => e.sourceSections?.length) && (
              <select
                aria-label="Filter form section"
                value={sourceSection}
                onChange={(e) => setSourceSection(e.target.value)}
              >
                <option value="">All form sections</option>
                {Array.from(
                  new Set(
                    data.enquiries.flatMap((e) => e.sourceSections || []),
                  ),
                )
                  .sort()
                  .map((section) => (
                    <option key={section}>{section}</option>
                  ))}
              </select>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={missing}
                onChange={(e) => setMissing(e.target.checked)}
              />
              Missing next action
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={response}
                onChange={(e) => setResponse(e.target.checked)}
              />
              Contact flags
            </label>
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="filter-summary">
            <span>
              {activeFilters} active filter{activeFilters === 1 ? "" : "s"}
              {tripFilter
                ? " · " + data.trips.find((t) => t.id === tripFilter)?.name
                : ""}
              {missing ? " · No next action" : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Reset filters
            </Button>
          </div>
        )}
        <div className="resultsbar">
          <span>
            <strong>{filtered.length}</strong> enquiries{" "}
            <span className="muted">
              · {data.trips.length} trips · assigned records
            </span>
          </span>
          <div>
            <select
              aria-label="Sort enquiries"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="created">Newest first</option>
              <option value="due">Next action first</option>
              <option value="interest">Interest, fit, oldest contact</option>
            </select>
            <div className="segmented">
              <button
                aria-pressed={view === "table"}
                className={view === "table" ? "active" : ""}
                onClick={() => setView("table")}
              >
                Table
              </button>
              <button
                aria-pressed={view === "pipeline"}
                className={view === "pipeline" ? "active" : ""}
                onClick={() => setView("pipeline")}
              >
                Pipeline
              </button>
            </div>
          </div>
        </div>
        {!filtered.length ? (
          <EmptyState
            title={activeFilters ? "No matching enquiries" : "No enquiries yet"}
          >
            <p>
              {activeFilters
                ? "Try a different search or reset the filters."
                : "Create an enquiry to start tracking a customer."}
            </p>
            <Button
              variant="outline"
              onClick={activeFilters ? clearFilters : onCreate}
            >
              {activeFilters ? "Reset all filters" : "New enquiry"}
            </Button>
          </EmptyState>
        ) : view === "table" ? (
          <>
            <div className="enquiry-cards">
              {filtered.map((e) => (
                <article
                  className="enquiry-mobile-card enquiry-click-row"
                  key={e.id}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "a, button, input, select, textarea, summary, [role='button']",
                      )
                    )
                      return;
                    if (window.getSelection()?.toString()) return;
                    event.currentTarget
                      .querySelector<HTMLAnchorElement>("a.button")
                      ?.click();
                  }}
                >
                  <div className="mobile-card-head">
                    <Customer e={e} />
                    <StageBadge stage={e.stage} />
                  </div>
                  <div className="mobile-card-meta">
                    <span>
                      {data.trips.find((t) => t.id === e.tripId)?.destination}
                    </span>
                    {!e.shared && e.owner !== "Shared team" && (
                      <span>{e.owner}</span>
                    )}
                  </div>
                  <Fit e={e} />
                  <p className="mobile-client-note">{clientNote(e)}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`View notes for ${e.name}`}
                    onClick={(event) => {
                      notesTrigger.current = event.currentTarget;
                      setNotesFor(e);
                    }}
                  >
                    Notes
                  </Button>
                  <SourceFollowup e={e} />
                  <div className="mobile-card-action">
                    <span>
                      <strong>
                        {nextTask(e)?.type ||
                          (isOpen(e) ? "Needs next action" : stages[e.stage])}
                      </strong>
                      <small
                        className={
                          nextTask(e) &&
                          Date.parse(nextTask(e)!.due) < Date.now()
                            ? "overdue-text"
                            : ""
                        }
                      >
                        {nextTask(e)
                          ? (Date.parse(nextTask(e)!.due) < Date.now()
                              ? "Overdue · "
                              : "") + dateTime(nextTask(e)!.due)
                          : e.response !== "none"
                            ? e.response.replaceAll("_", " ")
                            : "No pending task"}
                      </small>
                    </span>
                    <Link
                      className="button outline small"
                      to={"/enquiries/" + e.id}
                      state={{ from: location.pathname + location.search }}
                      aria-label={"Open " + e.name}
                    >
                      Open
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            <div className="table-scroll enquiries-table">
              <table>
                <thead>
                  <tr>
                    <th>Traveller</th>
                    <th>Stage</th>
                    <th>Trip fit / interest</th>
                    <th>
                      Next action <ArrowDown size={12} />
                    </th>
                    <th>Trip</th>
                    <th>Note / next step</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="enquiry-click-row"
                      onClick={(event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            "a, button, input, select, textarea, summary, [role='button']",
                          )
                        )
                          return;
                        if (window.getSelection()?.toString()) return;
                        event.currentTarget
                          .querySelector<HTMLAnchorElement>("a.row-open")
                          ?.click();
                      }}
                    >
                      <td>
                        <Customer e={e} />
                      </td>
                      <td>
                        <StageBadge stage={e.stage} />
                        {e.response !== "none" && (
                          <small className="contact-flag">
                            {e.response.replaceAll("_", " ")}
                          </small>
                        )}
                      </td>
                      <td>
                        <Fit e={e} />
                      </td>
                      <td>
                        <strong className="cell-title">
                          {nextTask(e)?.type ||
                            (isOpen(e) ? "Needs next action" : stages[e.stage])}
                        </strong>
                        <small
                          className={
                            nextTask(e) &&
                            Date.parse(nextTask(e)!.due) < Date.now()
                              ? "overdue-text"
                              : ""
                          }
                        >
                          {nextTask(e) &&
                          Date.parse(nextTask(e)!.due) < Date.now()
                            ? "Overdue · "
                            : ""}
                          {nextTask(e) ? dateTime(nextTask(e)!.due) : "—"}
                        </small>
                        {!nextTask(e) && <SourceFollowup e={e} />}
                      </td>
                      <td>
                        <strong className="cell-title">
                          {data.trips.find((t) => t.id === e.tripId)
                            ?.destination || "Unassigned trip"}
                        </strong>
                        {!e.shared && e.owner !== "Shared team" && (
                          <small>{e.owner}</small>
                        )}
                      </td>
                      <td className="client-note-cell">
                        <p>{clientNote(e)}</p>
                        {e.workbook && (
                          <small>{enquiryText(e.workbook.nextStep)}</small>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`View notes for ${e.name}`}
                          onClick={(event) => {
                            notesTrigger.current = event.currentTarget;
                            setNotesFor(e);
                          }}
                        >
                          Notes
                        </Button>
                        {e.lastContact && (
                          <small>
                            Last logged call: {dateTime(e.lastContact)}
                          </small>
                        )}
                      </td>
                      <td>
                        <Link
                          state={{ from: location.pathname + location.search }}
                          className="row-open"
                          aria-label={`Open ${e.name}`}
                          to={`/enquiries/${e.id}`}
                        >
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="pipeline" aria-label="Sales pipeline">
            {Object.entries(stages).map(([key, label]) => (
              <section className="pipeline-column" key={key}>
                <h3>
                  {label}
                  <span>{filtered.filter((e) => e.stage === key).length}</span>
                </h3>
                {filtered
                  .filter((e) => e.stage === key)
                  .map((e) => (
                    <Link
                      to={`/enquiries/${e.id}`}
                      state={{ from: location.pathname + location.search }}
                      className="pipeline-card"
                      key={e.id}
                    >
                      <strong>{e.name}</strong>
                      <small>
                        {data.trips.find((t) => t.id === e.tripId)?.destination}{" "}
                        {!e.shared && e.owner !== "Shared team"
                          ? `· ${e.owner}`
                          : ""}
                      </small>
                      <Fit e={e} />
                      <div>
                        <Clock3 size={13} />
                        {nextTask(e)
                          ? `${Date.parse(nextTask(e)!.due) < Date.now() ? "Overdue · " : ""}${dateTime(nextTask(e)!.due)}`
                          : "No next action"}
                      </div>
                    </Link>
                  ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function Detail() {
  const stages = useStageLabels();
  const { id } = useParams();
  const { data, run, role, error, writes } = useCRM();
  const e = data.enquiries.find((e) => e.id === id);
  const [tab, setTab] = useViewParam("tab", "overview");
  const location = useLocation();
  const navigate = useNavigate();
  const [action, setAction] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!e) return <Empty title="Enquiry not found" />;
  const trip = data.trips.find((t) => t.id === e.tripId);
  const paid = verifiedTotal(e);
  const block = confirmationBlock(e);
  const pending = e.tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.due.localeCompare(b.due));
  const next = pending[0];
  const rescheduling = pending.find((t) => t.id === taskId);
  const failed = writes.failedWrite;
  const retryOriginal =
    writes.retryable &&
    failed?.kind === "command" &&
    failed.id === e.id &&
    failed.command.type ===
      (action === "cancel"
        ? "taskStatus"
        : action === "call"
          ? "saveCall"
          : action);
  const returnTo =
    typeof location.state?.from === "string" &&
    (["/", "/enquiries", "/bookings"].includes(
      location.state.from.split("?")[0],
    ) ||
      /^\/trips\/[^/?]+(?:\?|$)/.test(location.state.from))
      ? location.state.from
      : "/enquiries";
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!e || busy || writes.pending || retryOriginal) return;
    const f = new FormData(ev.currentTarget);
    const s = (key: string) => String(f.get(key) || "");
    const dubai = (v: string) =>
      v ? new Date(`${v}:00+04:00`).toISOString() : undefined;
    let command: Command;
    switch (action) {
      case "note":
        command = { type: "note", text: s("note") };
        break;
      case "call":
        command = {
          type: "saveCall",
          colour: s("colour") as CallColour,
          note: s("note"),
          followup: dubai(s("due")),
        };
        break;
      case "task":
        command = {
          type: "task",
          due: dubai(s("due"))!,
          kind: s("kind"),
          note: s("note"),
          replaces: taskId || undefined,
        };
        break;
      case "stage":
        command = {
          type: "stage",
          stage: s("stage") as Stage,
          reason: s("reason"),
        };
        break;
      case "qualify":
        command = {
          type: "qualify",
          group: s("group") as Enquiry["group"],
          visa: s("visa") as Enquiry["visa"],
          temperature: s("temperature") as Enquiry["temperature"],
          availability: s("availability") as Enquiry["availability"],
          name: s("name").trim(),
          email: s("email").trim(),
          phone: s("phone").trim(),
          travellers: s("travellers") ? Number(s("travellers")) : null,
          selfDrive: s("selfDrive") as "yes" | "no" | "unknown",
          desiredDeparture: s("desiredDeparture"),
          bookingTimeframe: s("bookingTimeframe"),
        };
        break;
      case "payment":
        command = {
          type: "payment",
          amount: Math.round(Number(s("amount")) * 100),
          date: new Date(`${s("date")}T12:00:00+04:00`).toISOString(),
          reference: s("reference"),
        };
        break;
      case "verify":
        command = { type: "verify", paymentId };
        break;
      case "reverse":
        command = { type: "reverse", paymentId, reason: s("reason") };
        break;
      case "quote":
        command = {
          type: "quote",
          total: Math.round(Number(s("total")) * 100),
          deposit: Math.round(Number(s("deposit")) * 100),
          terms: s("terms"),
        };
        break;
      case "override":
        command = {
          type: "override",
          rank: s("rank") as "P1",
          reason: s("reason"),
        };
        break;
      case "cancel":
        command = {
          type: "taskStatus",
          taskId,
          status: "cancelled",
          reason: s("reason"),
        };
        break;
      default:
        command = { type: "confirm" };
    }
    setBusy(true);
    try {
      let previewed = false;
      const saved = await writes.command(e.id, e.revision, command, () => {
        previewed = true;
        setAction("");
      });
      if (saved && !previewed) setAction("");
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    note: "Add a note",
    call: "Log a call",
    task: taskId ? "Reschedule follow-up" : "Schedule follow-up",
    stage: "Change sales stage",
    qualify: "Edit details",
    payment: "Record payment",
    verify: "Verify deposit funds",
    reverse: "Reverse verified payment",
    quote: "Record accepted quotation",
    confirm: "Confirm booking",
    override: "Override trip-fit rank",
    cancel: "Cancel task",
  };
  return (
    <>
      <Link to={returnTo} className="back-link">
        <ArrowLeft size={15} />
        {returnTo.startsWith("/bookings")
          ? "All bookings"
          : returnTo.startsWith("/enquiries")
            ? "All enquiries"
            : returnTo.startsWith("/trips/")
              ? "Back to trip"
              : "Enquiries"}
      </Link>
      <div className="detail-heading">
        <div className="detail-person">
          <Avatar name={e.name} />
          <div>
            <div className="eyebrow">
              {e.id} · {enquiryText(e.source)}
            </div>
            <h1>{e.name}</h1>
            <p>
              {e.email || "No email recorded"} <span>·</span>{" "}
              {e.phone || "No phone recorded"}
            </p>
          </div>
        </div>
        <div className="heading-actions">
          <Button
            variant="outline"
            disabled={e.sample || !manualWhatsAppUrl(e.phone)}
            title="Open WhatsApp manually; a full phone number is required"
            onClick={() => {
              const url = e.sample ? null : manualWhatsAppUrl(e.phone);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <MessageCircle size={17} />
            Open WhatsApp
          </Button>
          <Button disabled={writes.pending} onClick={() => setAction("call")}>
            <Phone size={16} />
            Log call
          </Button>
          <DeleteRecord
            kind="enquiry"
            id={e.id}
            name={e.name}
            revision={e.revision}
            blocked={
              !e.sample && (e.booking || e.payments.length)
                ? "This enquiry has payment or booking records and cannot be deleted."
                : undefined
            }
          />
        </div>
      </div>
      <div className="detail-summary">
        <StageBadge stage={e.stage} />
        <WorkbookBadge e={e} />
        <span>{trip?.name}</span>
        {!e.shared && e.owner !== "Shared team" && (
          <span>Owner: {e.owner}</span>
        )}
        <span>Created {dateTime(e.createdAt)}</span>
      </div>
      {data.enquiries.filter((other) => other.customerId === e.customerId)
        .length > 1 && (
        <label className="repeat-enquiry">
          Customer enquiry history
          <select
            aria-label="Customer enquiry history"
            value={e.id}
            onChange={(ev) => navigate(`/enquiries/${ev.target.value}`)}
          >
            {data.enquiries
              .filter((other) => other.customerId === e.customerId)
              .map((other) => (
                <option key={other.id} value={other.id}>
                  {data.trips.find((t) => t.id === other.tripId)?.name} ·{" "}
                  {stages[other.stage]} · {dateTime(other.createdAt)}
                </option>
              ))}
          </select>
        </label>
      )}
      <section className="next-step" aria-label="Next action">
        <span className="next-step-icon">
          <Clock3 size={21} />
        </span>
        <div>
          <span className="field-label">
            {e.booking
              ? "Booking confirmed"
              : next && Date.parse(next.due) < Date.now()
                ? "Overdue follow-up"
                : "Next action"}
          </span>
          <h2>
            {e.booking
              ? e.booking.reference
              : next
                ? next.type
                : !isOpen(e)
                  ? stages[e.stage]
                  : !block
                    ? "Confirm this booking"
                    : "Set a follow-up"}
          </h2>
          <p>
            {e.booking
              ? "Outstanding balance: " + money((e.quote?.total || 0) - paid)
              : next
                ? dateTime(next.due) + " · Dubai time"
                : e.holdReason ||
                  (!block
                    ? "Deposit verified. Staff confirmation required."
                    : "Agree the next step with this customer.")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={writes.pending}
          onClick={() => {
            if (e.booking || (!next && !block)) setTab("payments");
            else if (!isOpen(e)) setAction("stage");
            else {
              setTaskId(next?.id || "");
              setAction("task");
            }
          }}
        >
          {e.booking || (!next && !block)
            ? "Review booking"
            : !isOpen(e)
              ? "Review stage"
              : next
                ? "Reschedule"
                : "Set follow-up"}
        </Button>
      </section>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <div className="tabs detail-tabs">
              {["overview", "activity", "payments", "files"].map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t === "payments" ? "Payments & booking" : t}
                </button>
              ))}
            </div>
            <div className="detail-content">
              {tab === "overview" && (
                <>
                  <div className="section-head">
                    <h2>Customer details</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAction("qualify")}
                    >
                      Edit details
                    </Button>
                  </div>
                  <div className="facts">
                    <div>
                      <span>Travel party</span>
                      <strong>
                        {e.group} · {e.travellers ?? "Unknown"} travellers
                      </strong>
                    </div>
                    <div>
                      <span>Schengen visa summary</span>
                      <strong>
                        {e.visa === "all"
                          ? "All travellers report visas"
                          : e.visa === "some"
                            ? "Mixed · needs qualification"
                            : e.visa === "none"
                              ? "No visas reported"
                              : "Unknown · needs qualification"}
                      </strong>
                    </div>
                    <div>
                      <span>Buying interest</span>
                      <strong className={`temperature ${e.temperature}`}>
                        {e.temperature}
                      </strong>
                    </div>
                    <div>
                      <span>Availability</span>
                      <strong>
                        {
                          {
                            pending: "Not checked",
                            confirmed: "Available",
                            unavailable: "Unavailable",
                          }[e.availability]
                        }{" "}
                        ·{" "}
                        {e.availability === "pending"
                          ? "not yet checked"
                          : "recorded by staff"}
                      </strong>
                    </div>
                    <div>
                      <span>Desired departure</span>
                      <strong>{e.desiredDeparture || "Not set"}</strong>
                    </div>
                    <div>
                      <span>Self-drive</span>
                      <strong>
                        {selfDrivePreference(e) === "yes"
                          ? "Yes"
                          : selfDrivePreference(e) === "no"
                            ? "No"
                            : "Not decided"}
                      </strong>
                    </div>
                    <div>
                      <span>Expected booking decision</span>
                      <strong>{e.bookingTimeframe || "Not set"}</strong>
                    </div>
                  </div>
                  <div className="info-note">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>
                        {e.rank || "Needs qualification"} · Trip fit
                      </strong>
                      <p>{e.rankReason}</p>
                    </div>
                  </div>
                  {e.requestedCallback && (
                    <div className="notice">
                      <strong>Callback request, not an appointment</strong>
                      <p>
                        {e.requestedCallback}. Agree a specific time before
                        scheduling.
                      </p>
                    </div>
                  )}
                  <div className="section-head spaced">
                    <h3>Next actions</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTaskId("");
                        setAction("task");
                      }}
                    >
                      <Plus size={14} />
                      Schedule
                    </Button>
                  </div>
                  {pending.length ? (
                    pending.map((t) => (
                      <div className="task-row" key={t.id}>
                        <span className="task-icon">
                          <Clock3 size={18} />
                        </span>
                        <div>
                          <strong>{t.type}</strong>
                          <small>{dateTime(t.due)} · Dubai</small>
                          <p>{t.note}</p>
                        </div>
                        <div className="task-buttons">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={writes.pending}
                            onClick={() => {
                              setTaskId(t.id);
                              setAction("task");
                            }}
                          >
                            Reschedule
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={writes.pending}
                            onClick={() => {
                              setTaskId(t.id);
                              setAction("cancel");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title={
                        isOpen(e)
                          ? "Give this enquiry a next step"
                          : "No pending sales tasks"
                      }
                      text={
                        e.holdReason ||
                        "Schedule a follow-up or log a call with a clear outcome."
                      }
                    />
                  )}
                </>
              )}
              {tab === "activity" && (
                <>
                  <div className="section-head">
                    <h2>Activity history</h2>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={writes.pending}
                      onClick={() => setAction("note")}
                    >
                      <Plus size={15} />
                      Add note
                    </Button>
                  </div>
                  <Timeline e={e} />
                  <details>
                    <summary>Task history ({e.tasks.length})</summary>
                    {e.tasks.map((t) => (
                      <p key={t.id}>
                        {t.type} · {dateTime(t.due)} · {t.status}
                      </p>
                    ))}
                  </details>
                </>
              )}
              {tab === "payments" && (
                <>
                  <div className="section-head">
                    <h2>Payments & booking</h2>
                  </div>
                  {e.quote ? (
                    <>
                      <div className="money-grid">
                        <Stat
                          label="Accepted booking value"
                          value={money(e.quote.total)}
                          foot="Accepted quotation"
                        />
                        <Stat
                          label="Verified funds"
                          value={money(paid)}
                          foot="Pending records excluded"
                        />
                        <Stat
                          label="Outstanding balance"
                          value={money(e.quote.total - paid)}
                          foot="Booking value less verified funds"
                        />
                      </div>
                      <div className="notice">
                        <strong>
                          Required deposit:{" "}
                          {e.quote.deposit === null
                            ? "Not defined"
                            : money(e.quote.deposit)}
                        </strong>
                        <p>{e.quote.terms}</p>
                        <small>
                          Issued {dateTime(e.quote.issuedAt)} · Accepted · AED
                        </small>
                      </div>
                      <div className="section-head spaced">
                        <h3>Payment records</h3>
                        <Button
                          size="sm"
                          disabled={writes.pending}
                          onClick={() => setAction("payment")}
                        >
                          <Plus size={15} />
                          Record payment
                        </Button>
                      </div>
                      {e.payments.map((p) => (
                        <div className="payment-row" key={p.id}>
                          <div>
                            <strong>{money(p.amount)}</strong>
                            <small>
                              {dateTime(p.date)} · {p.reference}
                            </small>
                            <small>
                              {p.verifier
                                ? `Verified by ${p.verifier}`
                                : "Not verified against bank records"}
                            </small>
                          </div>
                          <Badge
                            kind={
                              p.status === "verified"
                                ? "confirmed"
                                : "qualification"
                            }
                          >
                            {p.status === "pending" ? "Unverified" : p.status}
                          </Badge>
                          {p.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={writes.pending}
                              onClick={() => {
                                setPaymentId(p.id);
                                setAction("verify");
                              }}
                            >
                              Verify funds
                            </Button>
                          )}
                          {p.status === "verified" && role === "manager" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={writes.pending}
                              onClick={() => {
                                setPaymentId(p.id);
                                setAction("reverse");
                              }}
                            >
                              Reverse
                            </Button>
                          )}
                        </div>
                      ))}
                      {!e.payments.length && (
                        <Empty
                          title="No payments recorded"
                          text="A payment record starts unverified. Verify against bank records separately."
                        />
                      )}
                      <div
                        className={`confirmation-box ${!block ? "ready" : ""}`}
                      >
                        <ShieldCheck size={25} />
                        <div>
                          <h3>
                            {e.booking
                              ? `Confirmed · ${e.booking.reference}`
                              : block
                                ? "Not ready to confirm"
                                : "Deposit verified · confirmation pending"}
                          </h3>
                          <p>
                            {e.booking
                              ? `${dateTime(e.booking.confirmedAt)} · ${e.booking.actor}. Balance remains visible above.`
                              : block ||
                                "Staff can now explicitly confirm this booking."}
                          </p>
                        </div>
                        {!e.booking && (
                          <Button
                            disabled={!!block || writes.pending}
                            onClick={() => setAction("confirm")}
                          >
                            Confirm booking
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Empty
                      title="No accepted quotation yet"
                      text="Record the agreed amount and deposit before recording payments."
                    />
                  )}
                  {!e.quote && (
                    <Button
                      disabled={writes.pending}
                      onClick={() => setAction("quote")}
                    >
                      Record quotation
                    </Button>
                  )}
                  <p className="micro">
                    Receipt upload alone never verifies funds. No inventory
                    reservation or customer notification is performed.
                  </p>
                </>
              )}
              {tab === "files" && (
                <FilesPanel enquiry={e} saving={writes.pending} />
              )}
            </div>
          </section>
          {tab === "overview" && (
            <section className="panel activity-preview">
              <div className="section-head">
                <h2>Latest activity</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={writes.pending}
                  onClick={() => setAction("note")}
                >
                  Add note
                </Button>
              </div>
              <Timeline e={e} limit={3} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTab("activity")}
              >
                View full history <ArrowRight size={14} />
              </Button>
            </section>
          )}
        </div>
        <aside className="detail-aside">
          {e.workbook && <LeadNoteCard e={e} />}
          <section className="panel compact">
            <h3>Enquiry controls</h3>
            <label>
              Sales stage
              <StageBadge stage={e.stage} />
            </label>
            <Button
              variant="outline"
              onClick={() => setAction("stage")}
              disabled={!!e.booking || writes.pending}
            >
              Change stage
            </Button>
            <hr />
            <label>
              Trip fit
              <Fit e={e} />
            </label>
            <p className="micro">{e.rankReason}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={writes.pending}
              onClick={() => setAction("override")}
            >
              Override with reason
            </Button>
            <hr />
            <label>
              Contact flag<strong>{e.response.replaceAll("_", " ")}</strong>
            </label>
            <label>
              Last logged call
              <strong>
                {e.lastContact ? dateTime(e.lastContact) : "Not contacted"}
              </strong>
            </label>
            <Button
              variant="outline"
              disabled={writes.pending}
              onClick={() => {
                setTaskId("");
                setAction("task");
              }}
            >
              <CalendarDays size={16} />
              Set follow-up
            </Button>
          </section>
          <div className="draft-note">
            <MessageCircle size={20} />
            <p>
              <strong>Manual WhatsApp</strong>Log sent messages in activity.
            </p>
          </div>
        </aside>
      </div>
      <Modal
        open={!!action}
        onClose={() => setAction("")}
        title={titles[action] || ""}
        description={
          action === "verify"
            ? "Verify funds against your bank record. Booking confirmation is a separate step."
            : action === "confirm"
              ? "Confirm the booking after verifying the required deposit. The balance remains outstanding."
              : "Changes are saved in activity history. Times are Asia/Dubai."
        }
      >
        {(error || writes.error) && (
          <p className="error-banner" role="alert">
            {error || writes.error?.message}
          </p>
        )}
        {retryOriginal && (
          <div className="notice">
            <p>
              The response was not confirmed. Retry the original request before
              submitting another change.
            </p>
            <Button
              type="button"
              disabled={writes.pending}
              onClick={async () => {
                if (await writes.retry()) setAction("");
              }}
            >
              Retry original save
            </Button>
          </div>
        )}
        <form onSubmit={submit}>
          {action === "note" && (
            <label>
              Note
              <textarea
                name="note"
                required
                autoFocus
                defaultValue={currentNote(e)}
              />
            </label>
          )}
          {action === "call" && (
            <>
              <label>
                Call colour
                <select
                  name="colour"
                  defaultValue={e.callColour || ""}
                  required
                >
                  <option value="" disabled>
                    Choose a colour
                  </option>
                  {Object.entries(callColours).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <textarea name="note" required defaultValue={currentNote(e)} />
              </label>
              <label>
                Next follow-up (optional)
                <DateTimeField
                  pickerLabel="Follow-up date and time"
                  type="datetime-local"
                  name="due"
                />
              </label>
            </>
          )}
          {action === "task" && (
            <>
              <label>
                Task type
                <select
                  name="kind"
                  defaultValue={rescheduling?.type || "Follow-up"}
                >
                  {[
                    "Follow-up",
                    "Initial call",
                    "Callback",
                    "Availability check",
                    "Payment check",
                    "General",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Accepted date and time · Dubai
                <DateTimeField
                  pickerLabel="Follow-up date and time"
                  type="datetime-local"
                  name="due"
                  required
                  defaultValue={
                    rescheduling
                      ? new Date(Date.parse(rescheduling.due) + 4 * 3600000)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
              <label>
                Notes
                <textarea name="note" defaultValue={rescheduling?.note || ""} />
              </label>
            </>
          )}
          {action === "stage" && (
            <>
              <label>
                Stage
                <select name="stage" defaultValue={e.stage}>
                  {Object.entries(stages)
                    .filter(([k]) => k !== "CONFIRMED")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Reason
                <input
                  name="reason"
                  placeholder="Required for on hold, lost or not suitable"
                />
              </label>
              <p className="micro">
                Closing or holding cancels pending sales tasks and preserves
                their history. Booking confirmation uses the Payments tab.
              </p>
            </>
          )}
          {action === "qualify" && (
            <>
              <h3>Contact</h3>
              <label>
                Customer name
                <input
                  name="name"
                  defaultValue={e.name}
                  required
                  maxLength={100}
                />
              </label>
              <div className="form-grid">
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    defaultValue={e.email}
                    maxLength={254}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={e.phone || ""}
                    pattern="[+][1-9][0-9]{7,14}"
                    placeholder="Include country code"
                  />
                </label>
              </div>
              <p className="micro">
                Contact changes apply to this customer's enquiries.
              </p>
              <h3>Trip preferences</h3>
              <div className="form-grid">
                <label>
                  Number of travellers
                  <input
                    name="travellers"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={e.travellers ?? ""}
                  />
                </label>
                <label>
                  Self-drive option
                  <select
                    name="selfDrive"
                    defaultValue={selfDrivePreference(e)}
                  >
                    <option value="unknown">Not decided</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Desired departure
                  <DateTimeField
                    type="date"
                    pickerLabel="Desired departure"
                    name="desiredDeparture"
                    defaultValue={e.desiredDeparture || ""}
                  />
                </label>
                <label>
                  Expected booking decision
                  <input
                    name="bookingTimeframe"
                    defaultValue={e.bookingTimeframe || ""}
                    maxLength={300}
                    placeholder="When they expect to decide, e.g. next month"
                  />
                </label>
              </div>
              <h3>Qualification</h3>
              <label>
                Travel party
                <select name="group" defaultValue={e.group}>
                  {["couple", "solo", "family", "friends", "unknown"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Visa summary
                <select
                  name="visa"
                  defaultValue={e.visa === "some" ? "unknown" : e.visa}
                >
                  {["unknown", "all", "none"].map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "Yes" : v === "none" ? "No" : "Not set"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Buying interest
                <select name="temperature" defaultValue={e.temperature}>
                  {["hot", "warm", "cold", "unassessed"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Availability check
                <select name="availability" defaultValue={e.availability}>
                  <option value="pending">Not checked</option>
                  <option value="confirmed">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>
              <p className="micro">
                Staff check dates and capacity with the supplier. This does not
                reserve a place or confirm a booking.
              </p>
            </>
          )}
          {action === "payment" && (
            <>
              <label>
                Amount · AED
                <input
                  type="number"
                  name="amount"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Received date
                <DateTimeField
                  pickerLabel="Received date"
                  type="date"
                  name="date"
                  defaultValue={dubaiDay()}
                  required
                />
              </label>
              <label>
                Payment reference
                <input name="reference" required />
              </label>
              <div className="notice">
                Payment will be recorded as unverified.
              </div>
            </>
          )}
          {action === "quote" && (
            <>
              <label>
                Booking total · AED
                <input
                  type="number"
                  name="total"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Required deposit · AED
                <input
                  type="number"
                  name="deposit"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Accepted terms
                <textarea
                  name="terms"
                  required
                  placeholder="Party count, sharing, inclusions and deposit agreement"
                />
              </label>
              <label className="checkbox">
                <input type="checkbox" required />I am recording accepted terms
                agreed with the customer.
              </label>
            </>
          )}
          {action === "verify" && (
            <label className="checkbox">
              <input type="checkbox" required />I checked this payment against
              the bank record.
            </label>
          )}
          {action === "confirm" && (
            <>
              <div className="notice">
                Booking value {money(e.quote?.total || 0)} · Verified{" "}
                {money(paid)} · Balance {money((e.quote?.total || 0) - paid)}
              </div>
              <label className="checkbox">
                <input type="checkbox" required />
                Confirm this booking.
              </label>
            </>
          )}
          {action === "override" && (
            <label>
              Trip-fit rank
              <select name="rank" aria-label="Trip-fit rank">
                {["P1", "P2", "P3", "P4", "P5", "P6"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {["override", "reverse", "cancel"].includes(action) && (
            <label>
              Reason
              <textarea name="reason" required />
            </label>
          )}
          <div className="modal-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAction("")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || writes.pending || retryOriginal}
              variant={
                ["cancel", "reverse"].includes(action)
                  ? "destructive"
                  : "default"
              }
            >
              {busy
                ? "Saving…"
                : action === "verify"
                  ? "Verify funds"
                  : action === "confirm"
                    ? "Confirm booking"
                    : action === "cancel"
                      ? "Cancel task"
                      : action === "reverse"
                        ? "Reverse payment"
                        : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function Timeline({ e, limit }: { e: Enquiry; limit?: number }) {
  return (
    <div className="timeline">
      {e.activities.slice(0, limit).map((a) => (
        <div className="timeline-item" key={a.id}>
          <span className="timeline-dot">
            {a.type === "call" ? (
              <Phone size={13} />
            ) : a.type === "payment" ? (
              <Wallet size={13} />
            ) : a.type === "task" ? (
              <Clock3 size={13} />
            ) : (
              <Check size={13} />
            )}
          </span>
          <div>
            <strong>{a.type.replaceAll("_", " ")}</strong>
            <p>
              {a.type === "source"
                ? "Enquiry details received."
                : enquiryText(a.text)}
            </p>
            <small>
              {dateTime(a.at)} · {a.actor}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
function Trips() {
  const { data, run, role, writes, error } = useCRM();
  const stageLabels = useStageLabels();
  return (
    <TripsWorkspace
      data={data}
      run={run}
      role={role}
      writes={writes}
      error={error}
      stageLabels={stageLabels}
      renderDelete={(trip) => (
        <DeleteRecord
          kind="trip"
          id={trip.id}
          name={trip.name}
          revision={trip.version}
          blocked={
            data.enquiries.some((e) => e.tripId === trip.id)
              ? "This trip has enquiries and cannot be deleted while they are linked to it."
              : undefined
          }
        />
      )}
    />
  );
}
function Bookings() {
  const { data } = useCRM();
  const [search, setSearch] = useViewParam("q");
  const [balance, setBalance] = useViewParam("balance");
  const [confirmedSince] = useViewParam("confirmedSince");
  const location = useLocation();
  const [, setBookingParams] = useSearchParams();
  const bookingBase =
    "/bookings" +
    (confirmedSince
      ? "?confirmedSince=" + encodeURIComponent(confirmedSince)
      : "");
  const bookings = data.enquiries.filter(
    (e) =>
      e.booking && (!confirmedSince || e.booking.confirmedAt >= confirmedSince),
  );
  const shown = bookings.filter(
    (e) =>
      (!search ||
        (e.name + " " + e.booking!.reference)
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (balance !== "due" || (e.quote?.total || 0) > verifiedTotal(e)),
  );
  return (
    <>
      <Heading title="Bookings" />
      <div className="stats three">
        <Metric
          to={bookingBase}
          label="Confirmed bookings"
          value={bookings.length}
          foot="Explicit staff confirmation"
        />
        <Metric
          to={bookingBase}
          label="Booking value · AED"
          value={money(bookings.reduce((s, e) => s + (e.quote?.total || 0), 0))}
          foot={
            confirmedSince
              ? "Selected confirmation period"
              : "All confirmed bookings"
          }
        />
        <Metric
          to={bookingBase + (confirmedSince ? "&" : "?") + "balance=due"}
          label="Outstanding balance · AED"
          value={money(
            bookings.reduce(
              (s, e) => s + (e.quote?.total || 0) - verifiedTotal(e),
              0,
            ),
          )}
          foot="Includes balances after full deposit"
        />
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>Confirmed journeys</h2>
          <Badge kind="confirmed">{bookings.length} confirmed</Badge>
        </div>
        <div className="filterbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search bookings"
              placeholder="Search customer or booking reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter booking balance"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          >
            <option value="">All balances</option>
            <option value="due">Balance outstanding</option>
          </select>
          <span className="muted">{shown.length} results</span>
          {(search || balance || confirmedSince) && (
            <Button variant="ghost" onClick={() => setBookingParams({})}>
              Reset filters
            </Button>
          )}
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="booking-table">
              <thead>
                <tr>
                  <th>Booking / customer</th>
                  <th>Trip</th>
                  <th>Confirmed</th>
                  <th>Booking value</th>
                  <th>Verified paid</th>
                  <th>Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link
                        className="booking-ref"
                        state={{ from: location.pathname + location.search }}
                        to={`/enquiries/${e.id}?tab=payments`}
                      >
                        {e.booking!.reference}
                      </Link>
                      <small>
                        {e.name} · {e.travellers ?? "Unknown"} travellers
                      </small>
                    </td>
                    <td data-label="Trip">
                      {data.trips.find((t) => t.id === e.tripId)?.destination}
                      <small>
                        {data.trips.find((t) => t.id === e.tripId)?.departure ||
                          "Departure pending"}
                      </small>
                    </td>
                    <td data-label="Confirmed">
                      {dateTime(e.booking!.confirmedAt)}
                      <small>{e.booking!.actor}</small>
                    </td>
                    <td data-label="Booking value">{money(e.quote!.total)}</td>
                    <td data-label="Verified paid">
                      {money(verifiedTotal(e))}
                    </td>
                    <td data-label="Balance">
                      <strong>
                        {money(e.quote!.total - verifiedTotal(e))}
                      </strong>
                      <small>Balance due date not agreed</small>
                    </td>
                    <td>
                      <Link
                        className="row-open"
                        state={{ from: location.pathname + location.search }}
                        to={`/enquiries/${e.id}?tab=payments`}
                        aria-label={`Open booking ${e.booking!.reference}`}
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              bookings.length ? "No matching bookings" : "No confirmed bookings"
            }
            text={
              bookings.length
                ? "Try another customer name or balance filter."
                : "Verify the deposit and explicitly confirm from an enquiry’s Payments tab."
            }
          />
        )}
      </section>
      <p className="micro">
        Confirmation does not reserve inventory or send a customer notification.
      </p>
    </>
  );
}
function Overview() {
  const stages = useStageLabels();
  const { data } = useCRM();
  const permission = useQuery({
    queryKey: ["reports-access"],
    queryFn: reports,
  });
  const [period, setPeriod] = useViewParam("period", "all");
  const start =
    period === "7"
      ? Date.now() - 7 * 86400000
      : period === "30"
        ? Date.now() - 30 * 86400000
        : 0;
  const dateFilter = start ? new Date(start).toISOString() : "";
  const cohortLink =
    "/enquiries" +
    (dateFilter ? "?since=" + encodeURIComponent(dateFilter) : "");
  const cohort = data.enquiries.filter((e) => Date.parse(e.createdAt) >= start);
  const confirmed = cohort.filter((e) => e.booking);
  const confirmations = data.enquiries.filter(
    (e) => e.booking && Date.parse(e.booking.confirmedAt) >= start,
  );
  const payments = data.enquiries.flatMap((e) =>
    e.payments.filter(
      (p) => p.status === "verified" && Date.parse(p.date) >= start,
    ),
  );
  const open = data.enquiries.filter(isOpen);
  const overdue = open.flatMap((e) =>
    e.tasks.filter(
      (t) => t.status === "pending" && Date.parse(t.due) < Date.now(),
    ),
  );
  const actionless = open.filter((e) => !nextTask(e));
  if (permission.isPending)
    return (
      <Empty title="Loading manager report…" text="Checking manager access." />
    );
  if (permission.isError)
    return <Empty title="Report unavailable" text={permission.error.message} />;
  return (
    <>
      <Heading title="Overview">
        <select
          aria-label="Reporting period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="all">All dates</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </Heading>
      <div className="stats">
        <Metric
          to={cohortLink}
          label="Enquiries in cohort"
          value={cohort.length}
          foot="By enquiry creation date"
        />
        <Metric
          to={cohortLink + (dateFilter ? "&" : "?") + "stage=CONFIRMED"}
          label="Cohort conversion"
          value={
            cohort.length
              ? `${Math.round((confirmed.length / cohort.length) * 100)}%`
              : "—"
          }
          foot={`${confirmed.length} confirmed / ${cohort.length} enquiries`}
        />
        <Metric
          to={
            "/bookings" +
            (dateFilter
              ? "?confirmedSince=" + encodeURIComponent(dateFilter)
              : "")
          }
          label="Confirmed in period"
          value={confirmations.length}
          foot="By booking confirmation date"
        />
        <Metric
          to={
            "/enquiries?paidSince=" +
            encodeURIComponent(dateFilter || "1970-01-01T00:00:00.000Z")
          }
          label="Verified cash received"
          value={money(payments.reduce((s, p) => s + p.amount, 0))}
          foot="AED · by payment received date"
        />
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Where enquiries stand</h2>
            <span className="muted">Created cohort</span>
          </div>
          <div className="stage-chart">
            {Object.entries(stages).map(([key, label]) => {
              const count = cohort.filter((e) => e.stage === key).length;
              return (
                <Link
                  key={key}
                  to={cohortLink + (dateFilter ? "&" : "?") + "stage=" + key}
                >
                  <span>{label}</span>
                  <div className="bar-track">
                    <div
                      className={key.toLowerCase()}
                      style={{
                        width: `${cohort.length ? (count / cohort.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Needs attention</h2>
            <ListTodo size={20} />
          </div>
          <Link className="manager-alert" to="/?queue=overdue">
            <span>{overdue.length}</span>
            <div>
              <strong>Overdue commitments</strong>
              <p>Current queue, all dates. Start with the oldest.</p>
            </div>
          </Link>
          <Link className="manager-alert" to="/enquiries?missing=1">
            <span>{actionless.length}</span>
            <div>
              <strong>Open without next actions</strong>
              <p>Give every conversation a clear next step.</p>
            </div>
          </Link>
          <Link className="manager-alert" to="/enquiries?fit=needs&open=1">
            <span>{open.filter((e) => !e.rank).length}</span>
            <div>
              <strong>Need qualification</strong>
              <p>Incomplete answers or unresolved ranking policy.</p>
            </div>
          </Link>
          <Button asChild variant="outline">
            <Link to="/">
              Open today’s action queue <ArrowRight size={15} />
            </Link>
          </Button>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Enquiry sources</h2>
            <span className="muted">Created cohort</span>
          </div>
          {Array.from(new Set(cohort.map((e) => e.source)))
            .sort()
            .map((source) => (
              <div className="source-row" key={source}>
                <span>{enquiryText(source)}</span>
                <strong>
                  {cohort.filter((e) => e.source === source).length}
                </strong>
              </div>
            ))}
          {!cohort.length && (
            <p className="micro">No enquiries in this period.</p>
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Booking value & loss reasons</h2>
          </div>
          <strong className="report-money">
            {money(
              confirmations.reduce((s, e) => s + (e.quote?.total || 0), 0),
            )}
          </strong>
          <p className="muted">AED booking value · by confirmation date</p>
          {cohort
            .filter((e) => e.stage === "LOST" || e.stage === "NOT_SUITABLE")
            .map((e) => (
              <div className="source-row" key={e.id}>
                <span>{e.holdReason || "Reason not recorded"}</span>
                <strong>1</strong>
              </div>
            ))}
          {!cohort.some((e) => ["LOST", "NOT_SUITABLE"].includes(e.stage)) && (
            <p>No lost enquiries in this cohort.</p>
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Trips in this cohort</h2>
            <span className="muted">Created-date cohort</span>
          </div>
          {data.trips.map((t) => (
            <div className="source-row" key={t.id}>
              <span>{t.name}</span>
              <strong>
                {cohort.filter((e) => e.tripId === t.id).length} enquiries ·{" "}
                {confirmed.filter((e) => e.tripId === t.id).length} confirmed
              </strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Ageing enquiries</h2>
            <span className="muted">Current open · older than 7 days</span>
          </div>
          {open
            .filter((e) => Date.parse(e.createdAt) < Date.now() - 7 * 86400000)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(0, 10)
            .map((e) => (
              <Link to={"/enquiries/" + e.id} className="source-row" key={e.id}>
                <span>
                  {e.name}
                  {!e.shared && e.owner !== "Shared team" && (
                    <small>{e.owner}</small>
                  )}
                </span>
                <strong>
                  {Math.floor(
                    (Date.now() - Date.parse(e.createdAt)) / 86400000,
                  )}{" "}
                  days
                </strong>
              </Link>
            ))}
          {!open.some(
            (e) => Date.parse(e.createdAt) < Date.now() - 7 * 86400000,
          ) && <p className="micro">No open enquiries older than 7 days.</p>}
        </section>
      </div>
      <p className="micro">
        Manager-only report · Access and record scope are enforced by the API.
      </p>
    </>
  );
}
