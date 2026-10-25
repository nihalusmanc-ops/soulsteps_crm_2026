import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "./errors";
import type { AppEnv, Bindings } from "./types";
import type { Context } from "hono";
import type { Identity } from "../shared/api";

const SESSION_MS = 12 * 3600000;
const INVALID_LOGIN = "Email or password is incorrect.";
const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const passwordSchema = z
  .string()
  .min(15, "Use at least 15 characters.")
  .max(128);
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const random = (length = 32) =>
  hex(crypto.getRandomValues(new Uint8Array(length)));
const digest = async (token: string) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(token)),
    ),
  );
const cookieName = (c: Context<AppEnv>) =>
  new URL(c.req.url).protocol === "https:"
    ? "__Host-soulsteps_session"
    : "soulsteps_session";
function setSession(c: Context<AppEnv>, token: string) {
  setCookie(c, cookieName(c), token, {
    path: "/",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    maxAge: SESSION_MS / 1000,
  });
}
function configured(env: Bindings) {
  if (
    !env.PASSWORD_HASHER ||
    !env.PASSWORD_AUTH_SECRET ||
    env.PASSWORD_AUTH_SECRET.length < 32
  )
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Sign-in is temporarily unavailable. Contact your workspace manager.",
    );
}
async function kdf(
  env: Bindings,
  password: string,
  salt: string,
  expected?: string,
) {
  configured(env);
  const stub = env.PASSWORD_HASHER!.get(
    env.PASSWORD_HASHER!.idFromName("passwords-v1"),
  );
  let result: Response;
  try {
    result = await stub.fetch("https://password-hasher.internal/", {
      method: "POST",
      body: JSON.stringify({
        password,
        salt,
        ...(expected ? { expected } : {}),
      }),
    });
  } catch {
    // Never log the request or runtime exception: it may contain credential data.
    console.error("Password derivation service unavailable");
    throw new ApiError(
      503,
      "AUTH_UNAVAILABLE",
      "Password service is temporarily unavailable. Please try again shortly.",
    );
  }
  if (!result.ok)
    throw new ApiError(
      503,
      "AUTH_UNAVAILABLE",
      "Sign-in is temporarily unavailable. Please try again.",
    );
  return result.json() as Promise<{ hash?: string; valid?: boolean }>;
}
type Credentials = {
  user_id: string;
  salt: string;
  hash: string;
  version: number;
};
async function credentials(env: Bindings, id: string) {
  return env.DB.prepare(
    "SELECT user_id,salt,hash,version FROM auth_credentials WHERE user_id=?",
  )
    .bind(id)
    .first<Credentials>();
}
async function rateLimit(c: Context<AppEnv>, account: string, purpose: string) {
  configured(c.env);
  const now = Date.now(),
    window = Math.floor(now / (15 * 60000)),
    expires = new Date((window + 1) * 15 * 60000).toISOString();
  const secret = await crypto.subtle.importKey(
    "raw",
    encoder.encode(c.env.PASSWORD_AUTH_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ip = c.req.header("CF-Connecting-IP") || "local";
  const entries = [
    [`ip:${ip}`, 20],
    [`account:${account}`, 8],
  ] as const;
  const counters = await Promise.all(
    entries.map(async ([value, max]) => {
      const key = hex(
        new Uint8Array(
          await crypto.subtle.sign(
            "HMAC",
            secret,
            encoder.encode(`${purpose}:${window}:${value}`),
          ),
        ),
      );
      const row = await c.env.DB.prepare(
        "INSERT INTO auth_throttle(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=auth_throttle.count+1 RETURNING count",
      )
        .bind(key, expires)
        .first<{ count: number }>();
      return (row?.count || max + 1) > max;
    }),
  );
  await c.env.DB.prepare(
    "DELETE FROM auth_throttle WHERE bucket IN (SELECT bucket FROM auth_throttle WHERE expires_at < ? LIMIT 100)",
  )
    .bind(new Date(now - 3600000).toISOString())
    .run();
  if (counters.some(Boolean)) {
    c.header(
      "Retry-After",
      String(Math.max(1, Math.ceil((Date.parse(expires) - now) / 1000))),
    );
    throw new ApiError(
      429,
      "LOGIN_THROTTLED",
      "Too many attempts. Please try again in 15 minutes.",
    );
  }
}

export async function passwordIdentity(c: Context<AppEnv>): Promise<Identity> {
  configured(c.env);
  const token = getCookie(c, cookieName(c));
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(
      401,
      "LOGIN_REQUIRED",
      "Sign in to your Soulsteps workspace.",
    );
  const user = await c.env.DB.prepare(
    "SELECT u.id,u.display_name AS name,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_credentials p ON p.user_id=u.id AND p.version=s.credential_version WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
  )
    .bind(await digest(token), new Date().toISOString())
    .first<{ id: string; name: string; role: "staff" | "manager" }>();
  if (!user)
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "Your session ended. Please sign in again.",
    );
  return { ...user, local: false, authMethod: "password" };
}

/** Public login/session endpoints; same-origin checks run before these routes. */
export const passwordPublic = new Hono<AppEnv>();
passwordPublic.get("/options", (c) =>
  c.json({ method: c.env.AUTH_MODE === "password" ? "password" : "access" }),
);
passwordPublic.use(
  "*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ message: "Request is too large." }, 413),
  }),
);
passwordPublic.post("/login", async (c) => {
  if (c.env.AUTH_MODE !== "password")
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  const data = z
    .object({ email, password: z.string().min(1).max(128) })
    .strict()
    .parse(await c.req.json());
  await rateLimit(c, data.email, "login");
  const user = await c.env.DB.prepare(
    "SELECT id,display_name AS name,role,active FROM users WHERE lower(email)=?",
  )
    .bind(data.email)
    .first<{
      id: string;
      name: string;
      role: "staff" | "manager";
      active: number;
    }>();
  const saved = user?.active ? await credentials(c.env, user.id) : null;
  const verified = await kdf(
    c.env,
    data.password,
    saved?.salt || "0".repeat(64),
    saved?.hash || "0".repeat(64),
  );
  if (!user?.active || !saved || !verified.valid)
    throw new ApiError(401, "INVALID_LOGIN", INVALID_LOGIN);
  const token = random(),
    tokenHash = await digest(token),
    now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO auth_sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,?,?,?,?)",
    ).bind(
      tokenHash,
      user.id,
      saved.version,
      now,
      new Date(Date.now() + SESSION_MS).toISOString(),
    ),
    c.env.DB.prepare(
      "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      user.id,
      user.id,
      "staff_signed_in",
      c.get("requestId"),
      now,
      JSON.stringify({ method: "password" }),
    ),
    c.env.DB.prepare(
      "DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<? LIMIT 100)",
    ).bind(now),
  ]);
  setSession(c, token);
  return c.json({
    id: user.id,
    name: user.name,
    role: user.role,
    local: false,
    authMethod: "password",
  });
});
passwordPublic.post("/logout", async (c) => {
  const token = getCookie(c, cookieName(c));
  if (token)
    await c.env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?")
      .bind(await digest(token))
      .run();
  deleteCookie(c, cookieName(c), {
    path: "/",
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
  });
  return c.json({ signedOut: true });
});

/** Only an already authenticated, active invited user can set their own password. */
export const passwordAccount = new Hono<AppEnv>();
passwordAccount.get("/password-status", async (c) =>
  c.json({ hasPassword: !!(await credentials(c.env, c.get("identity").id)) }),
);
passwordAccount.post("/password", async (c) => {
  configured(c.env);
  const user = c.get("identity");
  const data = z
    .object({
      password: passwordSchema,
      currentPassword: z.string().max(128).optional(),
    })
    .strict()
    .parse(await c.req.json());
  await rateLimit(c, user.id, "change-password");
  const current = await credentials(c.env, user.id);
  if (
    current &&
    !(await kdf(c.env, data.currentPassword || "", current.salt, current.hash))
      .valid
  )
    throw new ApiError(
      400,
      "INCORRECT_PASSWORD",
      "Your current password is incorrect.",
    );
  const salt = random(),
    derived = await kdf(c.env, data.password, salt);
  if (!derived.hash)
    throw new ApiError(
      503,
      "AUTH_UNAVAILABLE",
      "Password could not be saved. Please try again.",
    );
  const version = (current?.version || 0) + 1,
    token = random(),
    tokenHash = await digest(token),
    now = new Date().toISOString();
  const guard =
    "EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=? AND version=? AND hash=?)";
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO auth_credentials(user_id,salt,hash,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,version=excluded.version,updated_at=excluded.updated_at WHERE auth_credentials.version=?",
    ).bind(user.id, salt, derived.hash, version, now, current?.version || 0),
    c.env.DB.prepare(
      `DELETE FROM auth_sessions WHERE user_id=? AND ${guard}`,
    ).bind(user.id, user.id, version, derived.hash),
    c.env.DB.prepare(
      `INSERT INTO auth_sessions(token_hash,user_id,credential_version,created_at,expires_at) SELECT ?,?,?,?,? WHERE ${guard}`,
    ).bind(
      tokenHash,
      user.id,
      version,
      now,
      new Date(Date.now() + SESSION_MS).toISOString(),
      user.id,
      version,
      derived.hash,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
    ).bind(
      crypto.randomUUID(),
      user.id,
      user.id,
      current ? "password_changed" : "password_set",
      c.get("requestId"),
      now,
      JSON.stringify({ sessionsRevoked: true }),
      user.id,
      version,
      derived.hash,
    ),
  ]);
  if (results[0].meta.changes !== 1)
    throw new ApiError(
      409,
      "PASSWORD_CONFLICT",
      "Your account changed. Refresh and try again.",
    );
  setSession(c, token);
  return c.json({ saved: true });
});
