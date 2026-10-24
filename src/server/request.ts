import { ApiError } from "./errors";
export const digest = async (value: string | ArrayBuffer) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string" ? new TextEncoder().encode(value) : value,
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export function requestKey(value: string | undefined) {
  if (!value || !/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid request key is required.",
    );
  return value;
}
