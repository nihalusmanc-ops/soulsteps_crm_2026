import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";
import { unstable_splitSqlQuery } from "wrangler";
import { app } from "../src/server/index";
import { PasswordHasher } from "../src/server/password-hasher";
import type { Bindings } from "../src/server/types";

const password = "Fictional test passphrase 2026!";
const nextPassword = "A different fictional passphrase!";
const origin = "http://localhost";
let runtime: Miniflare, env: Bindings;
beforeEach(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-01",
      script: "export default {fetch(){return new Response('ok')}}",
      d1Databases: { DB: "password-test" },
    }),
  );
  const DB = await runtime.getD1Database("DB");
  for (const file of readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await DB.batch(
      unstable_splitSqlQuery(
        readFileSync("drizzle/migrations/" + file, "utf8"),
      ).map((sql) => DB.prepare(sql)),
    );
  for (const [id, role] of [
    ["MANAGER", "manager"],
    ["STAFF", "staff"],
  ]) {
    await DB.prepare(
      "INSERT INTO users(id,email,role,active,display_name) VALUES(?,?,?,1,?)",
    )
      .bind(id, role + "@example.invalid", role, "Fictional " + role)
      .run();
    const salt = "ab".repeat(32),
      hash = pbkdf2Sync(
        password,
        Buffer.from(salt, "hex"),
        600000,
        32,
        "sha256",
      ).toString("hex");
    await DB.prepare(
      "INSERT INTO auth_credentials(user_id,salt,hash,version,updated_at) VALUES(?,?,?,1,?)",
    )
      .bind(id, salt, hash, new Date().toISOString())
      .run();
  }
  const processor = new PasswordHasher();
  env = {
    DB,
    APP_ENV: "local",
    PUBLIC_APP_URL: origin,
    AUTH_MODE: "password",
    PASSWORD_AUTH_SECRET: "fictional-test-secret-".repeat(3),
    PASSWORD_HASHER: {
      idFromName: () => ({}),
      get: () => ({
        fetch: (url: string, options: RequestInit) =>
          processor.fetch(new Request(url, options)),
      }),
    },
  } as unknown as Bindings;
});
afterEach(async () => runtime?.dispose());
async function post(
  path: string,
  data: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.request(
    origin + "/api" + path,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "X-Soulsteps-Request": "1",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: JSON.stringify(data),
    },
    env,
  );
}
async function login(role = "manager", pass = password) {
  const response = await post("/auth/login", {
    email: role + "@example.invalid",
    password: pass,
  });
  return {
    response,
    cookie: response.headers.get("Set-Cookie")?.split(";")[0] || "",
  };
}
const get = (path: string, cookie = "") =>
  app.request(origin + "/api" + path, { headers: { Cookie: cookie } }, env);

describe("Soulsteps password authentication", () => {
  it("uses a host-only Secure cookie on the hosted HTTPS origin", async () => {
    const httpsOrigin = "https://crm.example.invalid";
    env.PUBLIC_APP_URL = httpsOrigin;
    const response = await app.request(
      httpsOrigin + "/api/auth/login",
      {
        method: "POST",
        headers: {
          Origin: httpsOrigin,
          "Content-Type": "application/json",
          "X-Soulsteps-Request": "1",
        },
        body: JSON.stringify({ email: "manager@example.invalid", password }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie") || "";
    expect(cookie).toContain("__Host-soulsteps_session=");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });
  it("requires actual credentials, stores only token hashes and applies cookie protections", async () => {
    expect((await get("/state")).status).toBe(401);
    expect((await get("/me", "soulsteps_local_role=manager")).status).toBe(401);
    const { response, cookie } = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=Strict");
    expect(
      ((await (await get("/me", cookie)).json()) as { role: string }).role,
    ).toBe("manager");
    const stored = await env.DB.prepare(
      "SELECT token_hash FROM auth_sessions",
    ).first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toBe(cookie.split("=")[1]);
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) AS count FROM audit_events WHERE action='staff_signed_in'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });
  it("returns the same error for unknown emails, wrong passwords and inactive accounts", async () => {
    const known = await login("manager", "wrong password");
    const unknown = await login("unknown", "wrong password");
    await env.DB.prepare("UPDATE users SET active=0 WHERE id='MANAGER'").run();
    const inactive = await login();
    for (const { response } of [known, unknown, inactive]) {
      expect(response.status).toBe(401);
      expect(((await response.json()) as { message: string }).message).toBe(
        "Email or password is incorrect.",
      );
    }
  });
  it("throttles repeated guesses with a retry window", async () => {
    for (let i = 0; i < 8; i++)
      expect((await login("manager", "wrong")).response.status).toBe(401);
    const limited = (await login()).response;
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  }, 15000);
  it("rejects cross-site login, weak password changes and role impersonation", async () => {
    expect(
      (
        await post(
          "/auth/login",
          { email: "manager@example.invalid", password },
          undefined,
          { Origin: "https://other.invalid" },
        )
      ).status,
    ).toBe(403);
    const { cookie } = await login("staff");
    expect((await get("/reports", cookie)).status).toBe(403);
    expect(
      (await post("/auth/password", { password: "short" }, cookie)).status,
    ).toBe(400);
    expect(
      (await get("/me", cookie + "; soulsteps_local_role=manager")).status,
    ).toBe(200);
    expect(
      ((await (await get("/me", cookie)).json()) as { role: string }).role,
    ).toBe("staff");
  });
  it("expires and revokes sessions, and enforces active status and current roles on every request", async () => {
    const first = await login(),
      second = await login();
    expect((await post("/auth/logout", {}, first.cookie)).status).toBe(200);
    expect((await get("/me", first.cookie)).status).toBe(401);
    expect((await get("/me", second.cookie)).status).toBe(200);
    await env.DB.prepare(
      "UPDATE users SET role='staff' WHERE id='MANAGER'",
    ).run();
    expect((await get("/reports", second.cookie)).status).toBe(403);
    await env.DB.prepare(
      "UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00.000Z'",
    ).run();
    expect((await get("/me", second.cookie)).status).toBe(401);
    const third = await login();
    await env.DB.prepare("UPDATE users SET active=0 WHERE id='MANAGER'").run();
    expect((await get("/me", third.cookie)).status).toBe(401);
  });
  it("requires the current password and invalidates every old session when it changes", async () => {
    const first = await login(),
      second = await login();
    expect(
      (
        await post(
          "/auth/password",
          { password: nextPassword, currentPassword: "wrong" },
          first.cookie,
        )
      ).status,
    ).toBe(400);
    const changed = await post(
      "/auth/password",
      { password: nextPassword, currentPassword: password },
      first.cookie,
    );
    expect(changed.status).toBe(200);
    expect((await get("/me", first.cookie)).status).toBe(401);
    expect((await get("/me", second.cookie)).status).toBe(401);
    const fresh = changed.headers.get("Set-Cookie")!.split(";")[0];
    expect((await get("/me", fresh)).status).toBe(200);
    expect((await login("manager", password)).response.status).toBe(401);
    expect((await login("manager", nextPassword)).response.status).toBe(200);
    const saved = await env.DB.prepare(
      "SELECT salt,hash,version FROM auth_credentials WHERE user_id='MANAGER'",
    ).first<{ salt: string; hash: string; version: number }>();
    expect(saved?.version).toBe(2);
    expect(saved?.salt).not.toBe("ab".repeat(32));
    expect(saved?.hash).not.toContain(nextPassword);
  }, 15000);
  it("fails closed if the signing/rate secret or password service is missing", async () => {
    delete env.PASSWORD_AUTH_SECRET;
    expect((await login()).response.status).toBe(503);
    expect((await get("/me")).status).toBe(503);
  });
});
