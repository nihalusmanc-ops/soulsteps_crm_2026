import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { reminders, useWorkspace } from "./data/management";
import { dateTime } from "../shared/domain";
export function DueReminders() {
  const cfg = useWorkspace();
  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: reminders.list,
    refetchInterval: 15000,
  });
  const client = useQueryClient();
  if (query.isError)
    return (
      <p role="alert" className="notice">
        Due reminders could not be loaded. Your task queue is still available
        below.
      </p>
    );
  const unread = query.data?.filter((n) => !n.read_at) || [];
  if (cfg.settings.jobsPaused || cfg.settings.recoveryHold)
    return (
      <div className="notice">
        <strong>In-app checks are paused</strong>
        <p>
          Your tasks remain available. A manager can review the pause in
          Settings.
        </p>
      </div>
    );
  if (!unread.length) return null;
  return (
    <section className="panel due-reminders">
      <div className="section-head">
        <h2>Due reminders</h2>
        <span className="muted">One per scheduled task</span>
      </div>
      {unread.slice(0, 5).map((n) => (
        <div key={n.id}>
          <Link to={`/enquiries/${n.enquiry_id}`}>
            <strong>{n.name}</strong>
            <small>
              {JSON.parse(n.task).type} · {dateTime(JSON.parse(n.task).due)}
            </small>
          </Link>
          <button
            className="button ghost small"
            onClick={async () => {
              await reminders.read(n.id);
              await client.invalidateQueries({ queryKey: ["reminders"] });
            }}
          >
            Mark seen
          </button>
        </div>
      ))}
    </section>
  );
}
