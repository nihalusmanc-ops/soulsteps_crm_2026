import { expect, it } from "vitest";
import { passwordSchema } from "../src/server/password-auth";
it("accepts the owner-selected 12-character minimum and preserves longer passwords", () => {
  expect(passwordSchema.safeParse("Fictional12!").success).toBe(true);
  expect(
    passwordSchema.safeParse("Longer fictional passphrase 2026!").success,
  ).toBe(true);
});
it("rejects passwords below 12 or above 128 characters", () => {
  expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
  expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
});
