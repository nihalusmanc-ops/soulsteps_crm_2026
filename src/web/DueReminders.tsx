import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { reminders, useWorkspace, type Reminder } from "./data/management";
import { dateTime } from "../shared/domain";
export function DueReminders() {
  const lock = useRef(false);
  const cfg = useWorkspace();
  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: ({ signal }) => reminders.list(signal),
    refetchInterval: () => (lock.current ? false : 15000),
    refetchOnWindowFocus: () => !lock.current,
  });
  const client = useQueryClient();
  const seen = useMutation({
    mutationKey: ["reminder-seen"],
    mutationFn: reminders.read,
    retry: false,
    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: ["reminders"] });
      const previous = client
        .getQueryData<Reminder[]>(["reminders"])
        ?.find((n) => n.id === id);
      client.setQueryData<Reminder[]>(["reminders"], (current) =>
        current?.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      return previous;
    },
    onError: (_error, id, previous) => {
      if (previous)
        client.setQueryData<Reminder[]>(["reminders"], (current) =>
          current?.map((n) => (n.id === id ? previous : n)),
        );
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["reminders"] }),
  });
  if (query.isError)
    return (
      <p role="alert" className="notice">
        Due reminders could not be loaded. Your task queue is still available in
        the action queue.
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
        <span className="count">{unread.length}</span>
      </div>
      {seen.error && (
        <p role="alert" className="notice">
          {seen.error.message}
        </p>
      )}
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
            disabled={seen.isPending}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              try {
                await seen.mutateAsync(n.id);
              } catch {
                // The row and error are restored by the mutation callbacks.
              } finally {
                lock.current = false;
              }
            }}
          >
            Mark seen
          </button>
        </div>
      ))}
    </section>
  );
}
