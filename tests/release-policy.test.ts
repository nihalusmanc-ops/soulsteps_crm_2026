import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inspectRelease, releaseGates } from "../scripts/release-policy";
const production = JSON.parse(readFileSync("wrangler.jsonc", "utf8")),
  staging = JSON.parse(readFileSync("wrangler.staging.jsonc", "utf8"));
const commit = "a".repeat(40);
const evidence = () => ({
  environment: "production",
  commit,
  gates: Object.fromEntries(
    releaseGates.map((gate) => [
      gate,
      {
        status: "approved",
        reviewedBy: "Fictional test reviewer",
        reviewedAt: new Date().toISOString(),
        evidence: "Synthetic unit test only; no business approval.",
      },
    ]),
  ),
});
describe("release evidence cannot turn demo configuration into an approved deployment", () => {
  it("accepts safe isolated templates while blocking those templates as actual release config", () => {
    expect(
      inspectRelease(
        production,
        staging,
        "production",
        null,
        commit,
        true,
      ).every((c) => c.passed),
    ).toBe(true);
    const checks = inspectRelease(
      production,
      staging,
      "production",
      evidence(),
      commit,
    );
    expect(checks.find((c) => c.id === "provisioned-database")?.passed).toBe(
      false,
    );
    expect(checks.find((c) => c.id === "public-origin")?.passed).toBe(false);
    expect(checks.find((c) => c.id === "access-config")?.passed).toBe(false);
  });
  it("rejects shared resources, public alternate domains and runtime demo bypasses", () => {
    const bad = structuredClone(production);
    bad.define.__LOCAL_DEV__ = "true";
    bad.workers_dev = true;
    bad.r2_buckets = staging.r2_buckets;
    const checks = inspectRelease(
      bad,
      staging,
      "production",
      null,
      commit,
      true,
    );
    for (const id of ["identity-mode", "alternate-domains", "separate-bucket"])
      expect(checks.find((c) => c.id === id)?.passed).toBe(false);
  });
  it("requires the exact revision, recent owner evidence and approved Meta acceptance for live activation", () => {
    const doc = evidence();
    doc.commit = "b".repeat(40);
    doc.gates.productionContentAndTerms.status = "deferred";
    doc.gates.restoreDrill.reviewedAt = new Date(
      Date.now() - 31 * 86400000,
    ).toISOString();
    doc.gates.metaAcceptance.status = "deferred";
    const config = structuredClone(production);
    config.vars.META_LIVE_INTAKE_ENABLED = "true";
    const checks = inspectRelease(config, staging, "production", doc, commit);
    for (const id of [
      "evidence-scope",
      "owner-productionContentAndTerms",
      "owner-restoreDrill",
      "meta-live-evidence",
    ])
      expect(checks.find((c) => c.id === id)?.passed).toBe(false);
  });
});
