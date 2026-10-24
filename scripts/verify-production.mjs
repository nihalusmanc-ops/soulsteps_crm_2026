import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
for (const environment of ["staging", "production"]) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: resolve(`.wrangler/release/${environment}/index.js`),
      compatibilityDate: "2026-10-01",
      bindings: {
        APP_ENV: "local",
        ACCESS_TEAM_DOMAIN: "soulsteps-security-test.cloudflareaccess.com",
        ACCESS_AUDIENCE: "test-audience",
        META_LIVE_INTAKE_ENABLED: "false",
      },
    }),
  );
  try {
    const health = await (
      await runtime.dispatchFetch("http://localhost/api/health")
    ).json();
    if (health.mode !== "staff")
      throw new Error(
        `${environment} bundle accepted runtime local-mode override.`,
      );
    for (const path of ["/api/me", "/api/state", "/api/management/release"]) {
      const response = await runtime.dispatchFetch(`http://localhost${path}`, {
        headers: {
          Cookie: "soulsteps_local_role=manager",
          "Cf-Access-Authenticated-User-Email": "manager@example.invalid",
          "X-Role": "manager",
        },
      });
      if (response.status !== 401)
        throw new Error(
          `${environment} bundle did not reject unauthenticated fixture headers.`,
        );
    }
    console.log(
      `${environment}: compiled nonlocal bundle rejects demo identity and forged role/email headers.`,
    );
  } finally {
    await runtime.dispose();
  }
}
