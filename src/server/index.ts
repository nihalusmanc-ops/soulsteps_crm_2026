import { managementRoutes } from "./management";
import { importRoutes } from "./imports";
import { metaPublic, metaRoutes } from "./meta";
import { sweep, consume, type JobMessage } from "../jobs/service";
import type { Bindings } from "./types";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z, ZodError } from "zod";
import {
  authenticate,
  sameOrigin,
  requireManager,
  localFixtureAllowed,
} from "./auth";
import { Repository } from "./repository";
import { ApiError } from "./errors";
import type { AppEnv } from "./types";
import { createSchema, mutationSchema, tripSchema } from "../shared/api";
import { filesRoutes } from "./files";
import { digest, requestKey } from "./request";
export const app = new Hono<AppEnv>();
app.use("/api/*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Request-Id", c.get("requestId"));
  await next();
});
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json(
      {
        code: error.code,
        message: error.message,
        requestId: c.get("requestId"),
      },
      error.status,
    );
  if (error instanceof ZodError)
    return c.json(
      {
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: error.flatten(),
        requestId: c.get("requestId"),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return c.json(
      {
        code: "INVALID_JSON",
        message: "Invalid request format.",
        requestId: c.get("requestId"),
      },
      400,
    );
  console.error("API failure", { requestId: c.get("requestId") });
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message:
        "The action could not be completed. Retry with the same request key.",
      requestId: c.get("requestId"),
    },
    500,
  );
});
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    milestone: 5,
    mode: localFixtureAllowed(c.req.url, c.env) ? "local-demo" : "staff",
    persistence: "D1",
    outboundMessaging: false,
  }),
);
app.route("/webhooks/meta", metaPublic);
app.use(
  "/api/*",
  sameOrigin,
  authenticate,
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) =>
      c.json(
        { code: "FILE_TOO_LARGE", message: "Maximum request size is 6 MB." },
        413,
      ),
  }),
);
app.get("/api/me", (c) => c.json(c.get("identity")));
app.post("/api/local/session", async (c) => {
  if (!localFixtureAllowed(c.req.url, c.env))
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  const { role } = z
    .object({ role: z.enum(["staff", "manager"]) })
    .strict()
    .parse(await c.req.json());
  setCookie(c, "soulsteps_local_role", role, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 8 * 3600,
  });
  return c.json({ role });
});
const repo = (c: Parameters<typeof requireManager>[0]) =>
  new Repository(c.env.DB, c.get("identity"));
app.get("/api/state", async (c) => c.json(await repo(c).state()));
app.get("/api/enquiries", async (c) => {
  const { enquiries } = await repo(c).state();
  const cursor = c.req.query("cursor");
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 50));
  let start = 0;
  if (cursor) {
    start = enquiries.findIndex((e) => e.id === cursor) + 1;
    if (!start)
      throw new ApiError(400, "INVALID_CURSOR", "Invalid enquiry cursor.");
  }
  const items = enquiries.slice(start, start + limit);
  return c.json({
    items,
    nextCursor: start + limit < enquiries.length ? items.at(-1)?.id : null,
  });
});
app.get("/api/enquiries/:id", async (c) =>
  c.json(await repo(c).enquiry(c.req.param("id"))),
);
app.post("/api/enquiries", async (c) => {
  const input = createSchema.parse(await c.req.json());
  return c.json(
    await repo(c).create(
      input,
      requestKey(c.req.header("Idempotency-Key")),
      await digest(JSON.stringify(input)),
      c.get("requestId"),
    ),
    201,
  );
});
app.post("/api/enquiries/:id/commands", async (c) => {
  const input = mutationSchema.parse(await c.req.json());
  return c.json(
    await repo(c).command(
      c.req.param("id"),
      input.revision,
      input.command,
      requestKey(c.req.header("Idempotency-Key")),
      await digest(JSON.stringify(input)),
      c.get("requestId"),
    ),
  );
});
app.put("/api/trips/:id", async (c) => {
  requireManager(c);
  const trip = tripSchema.parse(await c.req.json());
  if (trip.id !== c.req.param("id"))
    throw new ApiError(400, "ID_MISMATCH", "Trip ID does not match.");
  return c.json(
    await repo(c).saveTrip(
      trip,
      requestKey(c.req.header("Idempotency-Key")),
      await digest(JSON.stringify(trip)),
      c.get("requestId"),
    ),
  );
});
app.get("/api/customers", async (c) => {
  const s = await repo(c).state();
  return c.json([
    ...new Map(
      s.enquiries.map((e) => [
        e.customerId,
        {
          id: e.customerId,
          name: e.name,
          email: e.email,
          enquiryIds: s.enquiries
            .filter((other) => other.customerId === e.customerId)
            .map((other) => other.id),
        },
      ]),
    ).values(),
  ]);
});
app.get("/api/bookings", async (c) =>
  c.json((await repo(c).state()).enquiries.filter((e) => e.booking)),
);
app.get("/api/reports", async (c) => {
  requireManager(c);
  return c.json(await repo(c).state());
});
app.route("/api", filesRoutes);
app.route("/api", managementRoutes);
app.route("/api", importRoutes);
app.route("/api", metaRoutes);
app.all("/api/*", (c) =>
  c.json(
    {
      code: "NOT_FOUND",
      message: "API route not found.",
      requestId: c.get("requestId"),
    },
    404,
  ),
);
export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(sweep(env));
  },
  queue: consume,
} satisfies ExportedHandler<Bindings, JobMessage>;
