import { describe, it, expect } from "vitest";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { validateAccessToken, localFixtureAllowed } from "../src/server/auth";
import type { Bindings } from "../src/server/types";
describe("Access identity verification", () => {
  const issuer = "https://soulsteps-test.cloudflareaccess.com",
    audience = "staff-app";
  async function fixture() {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test";
    return { privateKey, key: createLocalJWKSet({ keys: [jwk] }) };
  }
  it("accepts a valid cryptographic signature and mandatory claims", async () => {
    const { privateKey, key } = await fixture();
    const jwt = await new SignJWT({ email: "STAFF@example.invalid" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("invited-subject")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    expect(await validateAccessToken(jwt, issuer, audience, key)).toEqual({
      email: "staff@example.invalid",
      subject: "invited-subject",
    });
  });
  it.each(["expired", "audience", "issuer", "missing-exp", "forged"] as const)(
    "rejects %s tokens",
    async (scenario) => {
      const { privateKey, key } = await fixture();
      const other = await generateKeyPair("RS256");
      let builder = new SignJWT({ email: "staff@example.invalid" })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setSubject("subject")
        .setIssuer(scenario === "issuer" ? "https://evil.example" : issuer)
        .setAudience(scenario === "audience" ? "different-app" : audience)
        .setIssuedAt();
      if (scenario !== "missing-exp")
        builder = builder.setExpirationTime(
          scenario === "expired" ? "1 second ago" : "5m",
        );
      const jwt = await builder.sign(
        scenario === "forged" ? other.privateKey : privateKey,
      );
      await expect(
        validateAccessToken(jwt, issuer, audience, key),
      ).rejects.toMatchObject({ status: 401 });
    },
  );
  it("local fixture is not available in normal production module compilation", () =>
    expect(
      localFixtureAllowed("http://localhost:8787", {
        APP_ENV: "local",
      } as Bindings),
    ).toBe(false));
});
