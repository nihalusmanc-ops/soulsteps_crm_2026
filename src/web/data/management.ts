import { useQuery } from "@tanstack/react-query";
import { request, mutate } from "./api";
import type { CreateTripInput } from "../../shared/api";
import {
  defaultSettings,
  type WorkspaceSettings,
  type Rule,
  type RulePreview,
  type Job,
  type BackupRun,
} from "../../shared/management";
export const management = {
  createTrip: (input: CreateTripInput) =>
    mutate<{ id: string }>("/management/trips", input),
  settings: () => request<WorkspaceSettings>("/settings"),
  saveSettings: (settings: WorkspaceSettings) =>
    mutate("/management/settings", settings, "PUT"),
  release: (version: number) =>
    mutate("/management/recovery/release", {
      version,
      confirmation: "RESUME IN-APP CHECKS",
    }),
  jobs: () =>
    request<{
      jobs: Job[];
      storage: { data: string } | null;
      health: {
        last_started: string | null;
        last_success: string | null;
        last_error: string | null;
      } | null;
      counts: { status: string; count: number }[];
      backups: BackupRun[];
      attempts: {
        id: string;
        job_id: string;
        phase: string;
        at: string;
        outcome: string;
        error: string | null;
      }[];
    }>("/management/jobs"),
  reviewStorage: () => mutate("/management/storage/review", {}),
  sweep: () => mutate("/management/jobs/sweep", {}),
  retry: (id: string) =>
    mutate(`/management/jobs/${encodeURIComponent(id)}/retry`, {}),
  backup: () => mutate<{ id: string }>("/management/backups", {}),
  audit: () =>
    request<
      {
        id: string;
        actor: string;
        object_id: string;
        action: string;
        created_at: string;
        data: string;
      }[]
    >("/management/audit"),
  rules: (id: string) =>
    request<{
      rules: Rule[];
      activeVersion: number | null;
      tripVersion: number;
      history: { version: number; reviewed_at: string }[];
    }>(`/management/trips/${id}/rules`),
  preview: (id: string, rules: Rule[]) =>
    mutate<RulePreview>(`/management/trips/${id}/rules/preview`, { rules }),
  publish: (id: string, previewId: string) =>
    mutate(`/management/trips/${id}/rules/publish`, {
      previewId,
      reviewed: true,
    }),
  publishContent: (id: string, version: number) =>
    mutate(`/management/trips/${id}/publish`, { version, manualOnly: true }),
};
export function useWorkspace() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: management.settings,
    staleTime: 30000,
  });
  return { ...query, settings: query.data || defaultSettings };
}
export type Reminder = {
  id: string;
  enquiry_id: string;
  task_id: string;
  job_id: string;
  created_at: string;
  read_at: string | null;
  name: string;
  task: string;
};
export const reminders = {
  list: (signal?: AbortSignal) =>
    request<Reminder[]>("/notifications", { signal }),
  read: (id: string) => mutate(`/notifications/${id}/read`, {}),
};
