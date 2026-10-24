import type { Identity } from "../shared/api";
export type Bindings = {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string;
  PUBLIC_APP_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
};
export type AppEnv = {
  Bindings: Bindings;
  Variables: { identity: Identity; requestId: string };
};
