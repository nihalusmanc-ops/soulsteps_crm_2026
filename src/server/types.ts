import type { Identity } from "../shared/api";
export type Bindings = {
  DB: D1Database;
  JOBS_QUEUE: Queue<{ id: string }>;
  FILES_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string;
  PUBLIC_APP_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  META_PAGE_ID?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_GRAPH_VERSION?: string;
  META_LIVE_INTAKE_ENABLED?: string;
};
export type AppEnv = {
  Bindings: Bindings;
  Variables: { identity: Identity; requestId: string };
};
