import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Identity } from "../../shared/api";
import type { Command, Enquiry, State } from "../../shared/domain";
import { apiRepository, ApiRequestError } from "./api";
import { previewWrite, type CrmWrite } from "./optimistic";
import {
  currentNote,
  followupTask,
  localDue,
  callingList,
} from "../../shared/calling";

type Write = Extract<CrmWrite, { kind: "command" }>;
type Job = {
  command: Command;
  write?: Write;
  promise: Promise<boolean>;
  resolve: (ok: boolean) => void;
};
type Lane = {
  confirmed: Enquiry;
  jobs: Job[];
  running: boolean;
  error?: Error;
};
export type DraftField = "note" | "due" | "group" | "visa" | "pax";
type Draft = { value: string; base: string; ready: boolean };

/** One ordered queue per enquiry. Each row previews independently; failures pause
 * only that row and retain the exact original request for idempotent retry. */
export class CallingWrites {
  private lanes = new Map<string, Lane>();
  private drafts = new Map<string, Partial<Record<DraftField, Draft>>>();
  private listeners = new Set<() => void>();
  private version = 0;
  private disposed = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  views = new Map<string, string>();
  constructor(
    private client: QueryClient,
    private actor: Identity,
    private blocked: () => boolean,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  private get key() {
    return ["crm", this.actor.id];
  }
  get pending() {
    return [...this.lanes.values()].some(
      (lane) => lane.jobs.length > 0 && !lane.error,
    );
  }
  get failures() {
    return [...this.lanes]
      .filter(([, lane]) => lane.error)
      .map(([id, lane]) => ({
        id,
        name: lane.confirmed.name,
        error: lane.error!,
      }));
  }
  isPending = (id: string) => {
    const lane = this.lanes.get(id);
    return !!(lane?.jobs.length && !lane.error);
  };
  error = (id: string) => this.lanes.get(id)?.error;
  get hasDrafts() {
    return this.drafts.size > 0;
  }
  draft = (id: string, field: DraftField) => this.drafts.get(id)?.[field];
  edit = (id: string, field: DraftField, value: string, base: string) => {
    const fields = this.drafts.get(id) || {};
    fields[field] = {
      value,
      base: fields[field]?.base ?? base,
      ready: field !== "due" || !!value,
    };
    this.drafts.set(id, fields);
    this.emit();
    if (field === "note" || field === "due") {
      const key = `${id}:${field}`;
      clearTimeout(this.timers.get(key));
      this.timers.set(
        key,
        setTimeout(
          () => {
            this.timers.delete(key);
            void this.flushDraft(id, field);
          },
          field === "note" ? 750 : 300,
        ),
      );
    }
  };
  saved = (id: string, field: DraftField, value: string) => {
    const fields = this.drafts.get(id),
      draft = fields?.[field];
    if (!fields || !draft) return;
    if (draft.value === value) delete fields[field];
    else draft.base = value;
    if (!Object.keys(fields).length) this.drafts.delete(id);
    this.emit();
  };
  discardDraft = (id: string, field: DraftField) => {
    const fields = this.drafts.get(id);
    if (!fields?.[field]) return;
    delete fields[field];
    if (!Object.keys(fields).length) this.drafts.delete(id);
    const lane = this.lanes.get(id),
      command = lane?.jobs[0]?.command;
    if (
      lane?.error &&
      ((field === "note" && command?.type === "setNote") ||
        (field === "due" && command?.type === "setFollowup"))
    )
      this.lanes.delete(id);
    this.emit();
  };
  keepDraft = (id: string, field: DraftField, latest: string) => {
    const draft = this.drafts.get(id)?.[field];
    if (draft) {
      draft.base = latest;
      draft.ready = true;
      this.emit();
    }
  };
  commitDue = (id: string) => {
    const draft = this.draft(id, "due");
    if (draft) draft.ready = true;
    void this.flushDraft(id, "due");
  };
  conflict = (id: string, field: DraftField, latest: string) => {
    const draft = this.draft(id, field);
    return !!(
      draft &&
      !this.isPending(id) &&
      draft.base !== latest &&
      draft.value !== latest
    );
  };
  flushDraft = async (id: string, field: "note" | "due") => {
    const key = `${id}:${field}`;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const draft = this.draft(id, field),
      e = this.client
        .getQueryData<State>(this.key)
        ?.enquiries.find((e) => e.id === id);
    if (!draft || !e || !draft.ready || this.error(id)) return;
    if (field === "due" && callingList(e) === "closed") return;
    const latest =
      field === "note" ? currentNote(e) : localDue(followupTask(e)?.due);
    if (this.conflict(id, field, latest)) return;
    const value = draft.value;
    if (value === latest) {
      if (!this.isPending(id)) this.saved(id, field, value);
      return;
    }
    if (
      field === "due" &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(`${value}:00+04:00`)))
    )
      return;
    const ok = await this.command(
      id,
      field === "note"
        ? { type: "setNote", text: value }
        : {
            type: "setFollowup",
            due: value ? new Date(`${value}:00+04:00`).toISOString() : null,
            note: currentNote(e),
          },
    );
    if (ok) this.saved(id, field, value);
  };
  private next(state: State, enquiry: Enquiry, command: Command) {
    const base = {
      ...state,
      enquiries: state.enquiries.map((e) =>
        e.id === enquiry.id ? enquiry : e,
      ),
    };
    return previewWrite(
      base,
      { kind: "command", id: enquiry.id, revision: enquiry.revision, command },
      this.actor,
    )!.enquiries.find((e) => e.id === enquiry.id)!;
  }
  private render(id: string, lane: Lane) {
    this.client.setQueryData<State>(this.key, (state) => {
      if (!state) return state;
      let shown = lane.confirmed;
      if (!lane.error)
        for (const job of lane.jobs) {
          // An interrupted response may already have committed on the server.
          if (job.write && job.write.revision < shown.revision) continue;
          shown = this.next(state, shown, job.command);
        }
      return {
        ...state,
        enquiries: state.enquiries.map((e) => (e.id === id ? shown : e)),
      };
    });
    this.emit();
  }
  command = async (id: string, command: Command): Promise<boolean> => {
    if (this.disposed || this.blocked()) return false;
    await this.client.cancelQueries({ queryKey: this.key, exact: true });
    if (this.disposed || this.blocked()) return false;
    const state = this.client.getQueryData<State>(this.key);
    const current = state?.enquiries.find((e) => e.id === id);
    if (!state || !current) return false;
    let lane = this.lanes.get(id);
    if (lane?.error) return false;
    if (!lane) {
      lane = { confirmed: current, jobs: [], running: false };
      this.lanes.set(id, lane);
    }
    const previous = lane.jobs.at(-1);
    if (
      previous &&
      JSON.stringify(previous.command) === JSON.stringify(command)
    )
      return previous.promise;
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    const job: Job = { command, promise, resolve };
    try {
      this.next(state, current, command);
    } catch (error) {
      lane.error =
        error instanceof Error
          ? error
          : new Error("Could not save this change.");
      this.emit();
      return false;
    }
    lane.jobs.push(job);
    this.render(id, lane);
    void this.drain(id, lane);
    return promise;
  };
  private async drain(id: string, lane: Lane) {
    if (lane.running || lane.error) return;
    lane.running = true;
    while (lane.jobs.length && !lane.error && !this.disposed) {
      const job = lane.jobs[0];
      job.write ||= {
        kind: "command",
        id,
        revision: lane.confirmed.revision,
        command: job.command,
      };
      try {
        await apiRepository.command(id, job.write.revision, job.write.command);
        if (this.disposed) return;
        const state = this.client.getQueryData<State>(this.key)!;
        if (lane.confirmed.revision === job.write.revision)
          lane.confirmed = this.next(state, lane.confirmed, job.command);
        lane.jobs.shift();
        if (job.command.type === "setNote" || job.command.type === "saveCall")
          this.saved(
            id,
            "note",
            job.command.type === "setNote"
              ? job.command.text
              : job.command.note,
          );
        if (job.command.type === "setFollowup")
          this.saved(id, "due", localDue(job.command.due || undefined));
        this.render(id, lane);
        job.resolve(true);
      } catch (error) {
        lane.error =
          error instanceof Error
            ? error
            : new Error("Could not save this change.");
        this.render(id, lane);
        lane.jobs.forEach((item) => item.resolve(false));
      }
    }
    lane.running = false;
    if (!lane.error) this.lanes.delete(id);
    this.emit();
    if (!this.pending) {
      await Promise.allSettled([
        this.client.invalidateQueries({ queryKey: this.key, exact: true }),
        this.client.invalidateQueries({ queryKey: ["reminders"] }),
        this.client.invalidateQueries({ queryKey: ["reports-access"] }),
      ]);
    }
    if (!lane.error && !this.disposed) {
      void this.flushDraft(id, "note");
      void this.flushDraft(id, "due");
    }
  }
  retry = async (id: string) => {
    const lane = this.lanes.get(id);
    if (this.disposed || !lane?.error || lane.running || !lane.jobs.length)
      return;
    lane.running = true;
    await this.client.cancelQueries({ queryKey: this.key, exact: true });
    let current = this.client
      .getQueryData<State>(this.key)
      ?.enquiries.find((e) => e.id === id);
    // A 409 definitively rejected the write. An explicit retry uses the latest
    // record; ambiguous failures keep the original revision and request key.
    if (lane.error instanceof ApiRequestError && lane.error.status === 409) {
      try {
        const latest = await apiRepository.read();
        current = latest.enquiries.find((e) => e.id === id);
        if (!current) throw new Error("This enquiry is no longer available.");
        lane.jobs.forEach((job) => {
          job.write = undefined;
        });
      } catch (error) {
        lane.error =
          error instanceof Error
            ? error
            : new Error("Could not refresh this enquiry.");
        this.emit();
        lane.running = false;
        return;
      }
    }
    if (current) lane.confirmed = current;
    lane.error = undefined;
    lane.running = false;
    this.render(id, lane);
    await this.drain(id, lane);
  };
  dismiss = (id: string) => {
    const lane = this.lanes.get(id);
    if (lane?.running) return;
    this.lanes.delete(id);
    this.emit();
  };
  activate = () => {
    this.disposed = false;
  };
  dispose = () => {
    this.disposed = true;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.lanes.forEach((lane) =>
      lane.jobs.forEach((job) => job.resolve(false)),
    );
  };
}

export function useCallingWrites(
  actor: Identity | undefined,
  blocked: () => boolean,
) {
  const client = useQueryClient(),
    blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const store = useMemo(
    () =>
      actor
        ? new CallingWrites(client, actor, () => blockedRef.current())
        : null,
    [client, actor?.id],
  );
  useSyncExternalStore(
    store?.subscribe || (() => () => {}),
    store?.snapshot || (() => 0),
  );
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (store?.pending || store?.hasDrafts) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [store]);
  useEffect(() => {
    store?.activate();
    return () => store?.dispose();
  }, [store]);
  return store;
}
