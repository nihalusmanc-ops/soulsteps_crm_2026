import {
  Metric,
  ViewSwitch,
  LoadingWorkspace,
  EmptyState,
  useViewParam,
} from "./components/ui/workspace";
import { Management, RuleManager, PublishTrip } from "./Management";
import { LoginPage } from "./LoginPage";
import { AccountSecurity } from "./AccountSecurity";
import { DueReminders } from "./DueReminders";
import { useWorkspace, management } from "./data/management";
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
  type Trip,
} from "../shared/domain";
const Context = createContext<{
  data: State;
  run: (work: () => Promise<unknown>, message?: string) => Promise<boolean>;
  role: string;
  error: string;
}>({} as never);
const useCRM = () => useContext(Context);
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
  { to: "/", label: "Today", icon: LayoutDashboard },
  { to: "/enquiries", label: "Enquiries", icon: Users },
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
  const [loginBusy, setLoginBusy] = useState(false),
    [loginError, setLoginError] = useState("");
  const query = useQuery({
    queryKey: ["crm", me.data?.id],
    queryFn: () => repository.read(),
    enabled: !!me.data,
  });
  const client = useQueryClient();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const role = me.data?.role || "staff";
  const [create, setCreate] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const currentPage =
    nav.find((n) =>
      n.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(n.to),
    )?.label || "Workspace";
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
          <img className="brand-full-logo" src="/brand/soulsteps-logo.png" width="1536" height="946" alt="Soulsteps" />
        </Link>
        <nav aria-label="Main navigation">
          {nav
            .filter(
              (n) =>
                role === "manager" ||
                !["/overview", "/settings"].includes(n.to),
            )
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                onClick={() => setMobile(false)}
              >
                <n.icon size={19} />
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {me.data && (
            <Link
              className="account-link"
              to="/account/security"
              onClick={() => setMobile(false)}
            >
              Account security
            </Link>
          )}
          {me.data?.authMethod === "password" && (
            <button
              className="account-link"
              onClick={async () => {
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
            >
              Sign out
            </button>
          )}
          <div className="profile">
            <span className="avatar">DS</span>
            <div>
              <strong>{me.data?.name || "Staff workspace"}</strong>
              {me.data?.local ? (
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
              ) : (
                <small>{role}</small>
              )}
            </div>
          </div>
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
          <div className="topbar-right">
            <span className="demo-pill">
              <i />
              {me.data?.local ? "Demo mode" : "Staff workspace"}
            </span>
            <span className="timezone">Asia / Dubai</span>
          </div>
        </header>
        {me.data?.local && (
          <div className="demo-banner">
            Demo data · No customer messages sent
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
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
            <Context.Provider value={{ data: query.data, run, role, error }}>
              <Routes>
                <Route path="/account/security" element={<AccountSecurity />} />
                <Route
                  path="/settings"
                  element={
                    role === "manager" ? (
                      <Management />
                    ) : (
                      <Empty
                        title="Manager view"
                        text="Settings require a manager identity."
                      />
                    )
                  }
                />
                <Route
                  path="/"
                  element={<Today onCreate={() => setCreate(true)} />}
                />
                <Route
                  path="/enquiries"
                  element={<Enquiries onCreate={() => setCreate(true)} />}
                />
                <Route
                  path="/enquiries/:id"
                  element={<Detail key={location.pathname} />}
                />
                <Route path="/trips" element={<Trips />} />
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
                }}
                title="New demo enquiry"
                description="Use fictional names only. No real contact details or customer messages."
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
                              query.data.enquiries.find(
                                (e) => e.customerId === existingCustomer,
                              )?.name ||
                              "",
                          ),
                          String(f.get("trip")),
                          existingCustomer || undefined,
                        );
                      })
                    ) {
                      setCreate(false);
                      setExistingCustomer("");
                      navigate(`/enquiries/${id}`);
                    }
                  }}
                >
                  <label>
                    Customer record
                    <select
                      value={existingCustomer}
                      onChange={(e) => setExistingCustomer(e.target.value)}
                    >
                      <option value="">New customer</option>
                      {Array.from(
                        new globalThis.Map(
                          query.data.enquiries.map((e) => [e.customerId, e]),
                        ).values(),
                      ).map((e) => (
                        <option key={e.customerId} value={e.customerId}>
                          {e.name} · existing customer
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fictional customer name
                    <input
                      name="name"
                      required={!existingCustomer}
                      disabled={!!existingCustomer}
                      maxLength={100}
                      placeholder="Demo Traveller M"
                    />
                  </label>
                  <label>
                    Trip
                    <select name="trip">
                      {query.data.trips.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit">Create enquiry</Button>
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
  const [missingValue, setMissingValue] = useViewParam("missing");
  const [responseValue, setResponseValue] = useViewParam("response");
  const missing = missingValue === "1",
    response = responseValue === "1";
  const setMissing = (v: boolean) => setMissingValue(v ? "1" : "");
  const setResponse = (v: boolean) => setResponseValue(v ? "1" : "");
  const [owner, setOwner] = useViewParam("owner");
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
    missing,
    response,
    owner,
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
        (!paidSince ||
          e.payments.some(
            (p) => p.status === "verified" && p.date >= paidSince,
          )) &&
        (!openOnly || isOpen(e)) &&
        (!owner || e.owner === owner) &&
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
              aria-label="Filter owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">All owners</option>
              {Array.from(new Set(data.enquiries.map((e) => e.owner))).map(
                (name) => (
                  <option key={name}>{name}</option>
                ),
              )}
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
              {["Facebook", "Instagram", "Manual"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
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
              {owner ? " · " + owner : ""}
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
                <article className="enquiry-mobile-card" key={e.id}>
                  <div className="mobile-card-head">
                    <Customer e={e} />
                    <StageBadge stage={e.stage} />
                  </div>
                  <div className="mobile-card-meta">
                    <span>
                      {data.trips.find((t) => t.id === e.tripId)?.destination}
                    </span>
                    <span>{e.owner}</span>
                  </div>
                  <Fit e={e} />
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
                    <th>Trip / owner</th>
                    <th>Last contact</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
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
                            (isOpen(e)
                              ? "Needs next action"
                              : e.holdReason
                                ? "Closed / held"
                                : "Booking confirmed")}
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
                      </td>
                      <td>
                        <strong className="cell-title">
                          {data.trips.find((t) => t.id === e.tripId)
                            ?.destination || "Unassigned trip"}
                        </strong>
                        <small>{e.owner}</small>
                      </td>
                      <td>
                        {e.lastContact
                          ? dateTime(e.lastContact)
                          : "Not contacted"}
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
                        · {e.owner}
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
      <p className="micro">
        {data.trips.some((t) => t.activeRuleVersion)
          ? "Reviewed trip-fit versions"
          : "Draft trip-fit policy"}{" "}
        · Trip fit and buying interest are independent. Open a record to change
        stage with an activity trail.
      </p>
    </>
  );
}
function Detail() {
  const stages = useStageLabels();
  const { id } = useParams();
  const { data, run, role, error } = useCRM();
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
  const returnTo =
    typeof location.state?.from === "string" &&
    ["/", "/enquiries", "/bookings"].includes(location.state.from.split("?")[0])
      ? location.state.from
      : "/enquiries";
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!e || busy) return;
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
          type: "call",
          outcome: s("outcome") as "Connected",
          note: s("note"),
          taskId: s("task") || undefined,
          followup: dubai(s("due")),
          noNextReason: s("reason"),
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
      if (await run(() => repository.command(e.id, e.revision, command)))
        setAction("");
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    note: "Add a note",
    call: "Log a call",
    task: taskId ? "Reschedule follow-up" : "Schedule follow-up",
    stage: "Change sales stage",
    qualify: "Update qualification",
    payment: "Record payment",
    verify: "Verify deposit funds",
    reverse: "Reverse verified payment",
    quote: "Record accepted demo quotation",
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
            : "Today"}
      </Link>
      <div className="detail-heading">
        <div className="detail-person">
          <Avatar name={e.name} />
          <div>
            <div className="eyebrow">
              {e.id} · {e.source}
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
            disabled={!manualWhatsAppUrl(e.phone)}
            title="Open WhatsApp manually; a full phone number is required"
            onClick={() => {
              const url = manualWhatsAppUrl(e.phone);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <MessageCircle size={17} />
            Open WhatsApp
          </Button>
          <Button onClick={() => setAction("call")}>
            <Phone size={16} />
            Log call
          </Button>
        </div>
      </div>
      <div className="detail-summary">
        <StageBadge stage={e.stage} />
        <span>{trip?.name}</span>
        <span>Owner: {e.owner}</span>
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
                        {e.availability} ·{" "}
                        {e.availability === "pending"
                          ? "not yet checked"
                          : "recorded by staff"}
                      </strong>
                    </div>
                    <div>
                      <span>Desired departure</span>
                      <strong>Not yet qualified</strong>
                    </div>
                    <div>
                      <span>Self-drive / booking timeframe</span>
                      <strong>Unknown / not recorded</strong>
                    </div>
                  </div>
                  <div className="info-note">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>
                        {e.rank || "Needs qualification"} · Trip fit
                      </strong>
                      <p>{e.rankReason}</p>
                      <small>
                        A fit rank is not buying interest or visa eligibility
                        advice.
                      </small>
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
                  <div className="source-note">
                    <h3>Original source context</h3>
                    <p>{e.originalNote}</p>
                    <small>
                      Original group answer: {e.originalGroup} · preserved
                      independently of edits
                    </small>
                  </div>
                </>
              )}
              {tab === "activity" && (
                <>
                  <div className="section-head">
                    <h2>Activity history</h2>
                    <Button
                      variant="outline"
                      size="sm"
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
                    <Badge kind="qualification">Fictional terms only</Badge>
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
                        <Button size="sm" onClick={() => setAction("payment")}>
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
                            {p.status}
                          </Badge>
                          {p.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
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
                            disabled={!!block}
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
                      text="Record the agreed fictional amount and deposit before recording payments."
                    />
                  )}
                  {!e.quote && (
                    <Button onClick={() => setAction("quote")}>
                      Record demo quotation
                    </Button>
                  )}
                  <p className="micro">
                    Receipt upload alone never verifies funds. No inventory
                    reservation or customer notification is performed.
                  </p>
                </>
              )}
              {tab === "files" && <FilesPanel enquiry={e} />}
            </div>
          </section>
          {tab === "overview" && (
            <section className="panel activity-preview">
              <div className="section-head">
                <h2>Latest activity</h2>
                <Button
                  variant="ghost"
                  size="sm"
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
          <section className="panel compact">
            <h3>Enquiry controls</h3>
            <label>
              Sales stage
              <StageBadge stage={e.stage} />
            </label>
            <Button
              variant="outline"
              onClick={() => setAction("stage")}
              disabled={!!e.booking}
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
            ? "Only confirm verification after checking funds against the fictional bank record. This does not confirm the booking."
            : action === "confirm"
              ? "This deliberate action creates one demo booking and retains the outstanding balance."
              : "Changes are recorded in the local demo history. Times are Asia/Dubai."
        }
      >
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={submit}>
          {action === "note" && (
            <label>
              Note
              <textarea name="note" required autoFocus />
            </label>
          )}
          {action === "call" && (
            <>
              <label>
                Call outcome
                <select name="outcome">
                  {[
                    "Connected",
                    "No answer",
                    "Busy",
                    "Unreachable",
                    "Callback requested",
                    "Not interested",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Complete linked task
                <select name="task">
                  <option value="">No linked task</option>
                  {pending.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.type} · {dateTime(t.due)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Call notes
                <textarea name="note" />
              </label>
              <label>
                Next follow-up · Dubai
                <input type="datetime-local" name="due" />
              </label>
              <label>
                If no next action, explain why
                <input
                  name="reason"
                  placeholder="Required if no follow-up is scheduled"
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
                <input
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
                <select name="visa" defaultValue={e.visa}>
                  {["all", "none", "some", "unknown"].map((v) => (
                    <option key={v}>{v}</option>
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
                Manual availability
                <select name="availability" defaultValue={e.availability}>
                  {["pending", "confirmed", "unavailable"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <p className="micro">
                An existing manual rank override is preserved.
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
                <input
                  type="date"
                  name="date"
                  defaultValue={dubaiDay()}
                  required
                />
              </label>
              <label>
                Fictional reference
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
                Accepted fictional terms
                <textarea
                  name="terms"
                  required
                  placeholder="Party count, sharing, inclusions and deposit agreement"
                />
              </label>
              <label className="checkbox">
                <input type="checkbox" required />I am recording accepted
                fictional terms, not a live Norway price.
              </label>
            </>
          )}
          {action === "verify" && (
            <label className="checkbox">
              <input type="checkbox" required />I checked this fictional payment
              against the bank record.
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
                Explicitly confirm this demo booking.
              </label>
            </>
          )}
          {action === "override" && (
            <label>
              Trip-fit rank
              <select name="rank">
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
              disabled={busy}
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
            <p>{a.text}</p>
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
  const { data, run, role } = useCRM();
  const [editing, setEditing] = useState<Trip | null>(null);
  const [preview, setPreview] = useState(false);
  const [newTrip, setNewTrip] = useState(false);
  const [ruleTrip, setRuleTrip] = useState("");
  const [publishing, setPublishing] = useState<Trip | null>(null);
  return (
    <>
      <Heading title="Trips">
        {role === "manager" && (
          <Button onClick={() => setNewTrip(true)}>
            <Plus size={16} />
            New trip
          </Button>
        )}
      </Heading>
      <div className="trips-grid">
        {data.trips.map((t) => (
          <section className="panel trip-card" key={t.id}>
            <div className="trip-card-top">
              <span className="trip-destination">
                <Map size={18} />
                {t.destination}
              </span>
              <Badge kind={t.status === "published" ? "confirmed" : "draft"}>
                {t.status}
              </Badge>
            </div>
            <div className="trip-body">
              <div className="eyebrow">
                {t.type} JOURNEY · VERSION {t.version}
              </div>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="trip-facts">
                <div>
                  <CalendarDays size={17} />
                  <span>{t.departure || "Departure dates pending"}</span>
                </div>
                <div>
                  <Wallet size={17} />
                  <span>
                    {t.price
                      ? `${money(t.price)} / person · demo draft`
                      : "Approved pricing not supplied"}
                  </span>
                </div>
                <div>
                  <Map size={17} />
                  <span>
                    {t.itinerary
                      ? "Draft itinerary notes saved"
                      : "Approved itinerary pending"}
                  </span>
                </div>
              </div>
              <Link
                className="trip-enquiries"
                to={"/enquiries?trip=" + encodeURIComponent(t.id) + "&open=1"}
              >
                {
                  data.enquiries.filter((e) => e.tripId === t.id && isOpen(e))
                    .length
                }{" "}
                open enquiries <ArrowRight size={15} />
              </Link>
              <div className="trip-actions">
                <Button
                  variant="outline"
                  onClick={() => setEditing(t)}
                  disabled={role !== "manager"}
                >
                  Edit trip details
                </Button>
                {role === "manager" && (
                  <Button variant="outline" onClick={() => setPublishing(t)}>
                    Review publication
                  </Button>
                )}
                <Button
                  disabled={role !== "manager"}
                  variant="ghost"
                  onClick={() => {
                    setRuleTrip(t.id);
                    setPreview(true);
                  }}
                >
                  Preview fit rules <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          </section>
        ))}
      </div>
      {!data.trips.length && (
        <EmptyState title="No trips yet">
          <p>Create a draft trip to begin.</p>
        </EmptyState>
      )}
      <p className="micro">Trip edits do not change accepted quotations.</p>
      <Modal
        open={newTrip}
        onClose={() => setNewTrip(false)}
        title="Create draft trip"
        description="Add a fixed or bespoke journey without inventing dates, prices or itinerary content."
      >
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            if (
              await run(() =>
                management.createTrip({
                  name: String(f.get("name")),
                  destination: String(f.get("destination")),
                  description: String(f.get("description") || ""),
                  type: String(f.get("type")) as "fixed" | "bespoke",
                }),
              )
            )
              setNewTrip(false);
          }}
        >
          <label>
            Trip name
            <input name="name" required maxLength={150} />
          </label>
          <label>
            Destination
            <input name="destination" required maxLength={150} />
          </label>
          <label>
            Journey type
            <select name="type">
              <option value="fixed">Fixed</option>
              <option value="bespoke">Bespoke</option>
            </select>
          </label>
          <label>
            Draft description
            <textarea name="description" />
          </label>
          <Button type="submit">Create draft</Button>
        </form>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit draft trip"
        description="Manager demo editor. Saved as a draft; no content is published or sent."
      >
        {editing && (
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              const s = (k: string) => String(f.get(k) || "");
              if (
                await run(() =>
                  repository.saveTrip({
                    ...editing,
                    name: s("name"),
                    description: s("description"),
                    departure: s("departure"),
                    availabilityNote: s("availability"),
                    itinerary: s("itinerary"),
                    price: s("price")
                      ? Math.round(Number(s("price")) * 100)
                      : null,
                    deposit: s("deposit")
                      ? Math.round(Number(s("deposit")) * 100)
                      : null,
                  }),
                )
              )
                setEditing(null);
            }}
          >
            <label>
              Trip name
              <input name="name" defaultValue={editing.name} required />
            </label>
            <label>
              Description
              <textarea name="description" defaultValue={editing.description} />
            </label>
            <label>
              Departure date
              <input
                type="date"
                name="departure"
                defaultValue={editing.departure}
              />
            </label>
            <div className="form-grid">
              <label>
                Draft price per person · AED
                <input
                  type="number"
                  name="price"
                  min="0.01"
                  step="0.01"
                  defaultValue={editing.price ? editing.price / 100 : ""}
                />
              </label>
              <label>
                Draft deposit · AED
                <input
                  type="number"
                  name="deposit"
                  min="0.01"
                  step="0.01"
                  defaultValue={editing.deposit ? editing.deposit / 100 : ""}
                />
              </label>
            </div>
            <label>
              Availability note
              <textarea
                name="availability"
                defaultValue={editing.availabilityNote}
              />
            </label>
            <label>
              Draft itinerary / content notes
              <textarea
                name="itinerary"
                defaultValue={editing.itinerary}
                placeholder="Leave blank until content is supplied"
              />
            </label>
            <Button type="submit">Save draft trip</Button>
          </form>
        )}
      </Modal>
      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Trip-fit rule preview"
        description="Review affected profiles before publishing a version. Overrides and historical closed profiles are preserved."
      >
        {ruleTrip && (
          <RuleManager tripId={ruleTrip} done={() => setPreview(false)} />
        )}
      </Modal>
      <Modal
        open={!!publishing}
        onClose={() => setPublishing(null)}
        title="Review trip publication"
        description="Publish approved draft content for manual CRM use."
      >
        {publishing && (
          <PublishTrip trip={publishing} done={() => setPublishing(null)} />
        )}
      </Modal>
    </>
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
        Fictional amounts only. Confirmation does not reserve inventory or send
        a customer notification.
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
          <option value="all">All demo dates</option>
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
          {["Facebook", "Instagram", "Manual"].map((source) => (
            <div className="source-row" key={source}>
              <span>{source}</span>
              <strong>
                {cohort.filter((e) => e.source === source).length}
              </strong>
            </div>
          ))}
          <p className="micro">
            Source labels are demo fixtures. Ad spend and campaign ROI are not
            supplied.
          </p>
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
                  <small>{e.owner}</small>
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
