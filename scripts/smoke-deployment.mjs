import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const origin = new URL(process.argv[2] || "");
if (
  origin.protocol !== "https:" ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error("Supply the deployed HTTPS origin without a path.");
const built = readFileSync(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const assets = [...built.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
  (match) => match[1],
);
if (!assets.some((path) => path.endsWith(".js")))
  throw new Error("The checked build has no application bundle.");
async function get(path, headers) {
  return fetch(new URL(path, origin), {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
}
async function check() {
  const root = await get("/");
  if (!root.ok) throw new Error("Published login page is unavailable.");
  const html = await root.text();
  for (const asset of assets) {
    if (!html.includes(asset))
      throw new Error("Cloudflare has not served the checked build yet.");
    const response = await get(asset);
    if (!response.ok)
      throw new Error("Published application asset is unavailable.");
    await response.body?.cancel();
  }
  const options = await get("/api/auth/options");
  if (!options.ok || (await options.json()).method !== "password")
    throw new Error("The expected Soulsteps login is unavailable.");
  for (const path of [
    "/api/me",
    "/api/state",
    "/api/customers?q=smoke-check",
    "/api/reports",
  ]) {
    const response = await get(path, {
      "X-Role": "manager",
      "Cf-Access-Authenticated-User-Email": "untrusted@example.invalid",
    });
    if (response.status !== 401)
      throw new Error(
        `Private endpoint did not reject anonymous access: ${path.split("?")[0]}`,
      );
    await response.body?.cancel();
  }
}
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await check();
    console.log(
      "Published build, Soulsteps login and private API access checks passed. No CRM records changed.",
    );
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.log("Waiting for the published build to become available…");
    await setTimeout(3000);
  }
}
