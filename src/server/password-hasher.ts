import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";

export const PASSWORD_ITERATIONS = 600_000;
const input = z
  .object({
    password: z.string().max(128),
    salt: z.string().regex(/^[a-f0-9]{64}$/),
    expected: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

/** Internal binding only. Its CPU allowance supports the full password work factor. */
export class PasswordHasher {
  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== "POST" ||
      Number(request.headers.get("content-length") || 0) > 4096
    )
      return new Response(null, { status: 400 });
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 400 });
    let value: z.infer<typeof input>;
    try {
      value = input.parse(JSON.parse(raw));
    } catch {
      return new Response(null, { status: 400 });
    }
    const derived = pbkdf2Sync(
      value.password,
      Buffer.from(value.salt, "hex"),
      PASSWORD_ITERATIONS,
      32,
      "sha256",
    );
    return Response.json(
      value.expected
        ? {
            valid: timingSafeEqual(derived, Buffer.from(value.expected, "hex")),
          }
        : { hash: derived.toString("hex") },
    );
  }
}
