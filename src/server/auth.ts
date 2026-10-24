import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { ApiError } from "./errors";
import type { AppEnv, Bindings } from "./types";

declare const __LOCAL_DEV__: boolean;
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function localFixtureAllowed(url: string, env: Bindings) {
  return (
    typeof __LOCAL_DEV__ !== "undefined" &&
    __LOCAL_DEV__ &&
    env.APP_ENV === "local" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  );
}
export async function validateAccessToken(
  token: string,
  issuer: string,
  audience: string,
  key?: JWTVerifyGetKey,
) {
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    !audience
  )
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Access login is not configured.",
    );
  let jwks: JWTVerifyGetKey | undefined = key || keys.get(issuer);
  if (!jwks) {
    const remote = createRemoteJWKSet(
      new URL(`${issuer}/cdn-cgi/access/certs`),
    );
    keys.set(issuer, remote);
    jwks = remote;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (typeof payload.email !== "string" || typeof payload.sub !== "string")
      throw new Error();
    return { email: payload.email.toLowerCase(), subject: payload.sub };
  } catch {
    throw new ApiError(
      401,
      "INVALID_IDENTITY",
      "Your login could not be verified. Sign in again.",
    );
  }
}
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  let id: string | undefined;
  if (localFixtureAllowed(c.req.url, c.env)) {
    const role =
      getCookie(c, "soulsteps_local_role") === "staff" ? "staff" : "manager";
    id = role === "manager" ? "DEMO-MANAGER" : "DEMO-STAFF";
  } else {
    const issuer = c.env.ACCESS_TEAM_DOMAIN
      ? `https://${c.env.ACCESS_TEAM_DOMAIN}`
      : "";
    if (!issuer || !c.env.ACCESS_AUDIENCE)
      throw new ApiError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Staff login requires Cloudflare Access configuration.",
      );
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token)
      throw new ApiError(
        401,
        "LOGIN_REQUIRED",
        "Sign in through the staff access portal.",
      );
    const claims = await validateAccessToken(
      token,
      issuer,
      c.env.ACCESS_AUDIENCE,
    );
    // Identity subject must be explicitly bound by an operator, not trusted from email headers.
    const user = await c.env.DB.prepare(
      "SELECT id FROM users WHERE lower(email)=? AND identity_subject=? AND active=1",
    )
      .bind(claims.email, claims.subject)
      .first<{ id: string }>();
    id = user?.id;
  }
  const user = id
    ? await c.env.DB.prepare(
        "SELECT id, display_name AS name, role FROM users WHERE id=? AND active=1",
      )
        .bind(id)
        .first<{ id: string; name: string; role: "staff" | "manager" }>()
    : null;
  if (!user)
    throw new ApiError(
      403,
      "NOT_INVITED",
      "This identity is not an active invited staff member.",
    );
  c.set("identity", { ...user, local: localFixtureAllowed(c.req.url, c.env) });
  await next();
};
export function requireManager(c: Context<AppEnv>) {
  if (c.get("identity").role !== "manager")
    throw new ApiError(
      403,
      "MANAGER_REQUIRED",
      "This action requires a manager.",
    );
}
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const allowed = localFixtureAllowed(c.req.url, c.env)
      ? [
          new URL(c.req.url).origin,
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          "http://127.0.0.1:8787",
          "http://localhost:8787",
        ]
      : c.env.PUBLIC_APP_URL
        ? [new URL(c.env.PUBLIC_APP_URL).origin]
        : [];
    const origin = c.req.header("Origin");
    if (
      !origin ||
      !allowed.includes(origin) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    )
      throw new ApiError(
        403,
        "UNTRUSTED_ORIGIN",
        "Open this action from the CRM workspace.",
      );
    if (c.req.header("X-Soulsteps-Request") !== "1")
      throw new ApiError(
        403,
        "CSRF_CHECK_FAILED",
        "Workspace request header is missing.",
      );
  }
  await next();
};
