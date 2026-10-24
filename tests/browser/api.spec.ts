import { test, expect, type APIRequestContext } from "@playwright/test";
const origin = "http://127.0.0.1:8791";
const headers = { Origin: origin, "X-Soulsteps-Request": "1" };
async function command(
  request: APIRequestContext,
  id: string,
  revision: number,
  command: unknown,
  key = crypto.randomUUID(),
) {
  return request.post(`/api/enquiries/${id}/commands`, {
    headers: { ...headers, "Idempotency-Key": key },
    data: { revision, command },
  });
}
test("staff scope and manager-only routes are enforced at the API", async ({
  request,
}) => {
  await request.post("/api/local/session", {
    headers,
    data: { role: "staff" },
  });
  expect((await request.get("/api/reports")).status()).toBe(403);
  expect((await request.get("/api/enquiries/DEMO-PRIVATE")).status()).toBe(404);
  const state = await (await request.get("/api/state")).json();
  expect(
    state.enquiries.every(
      (e: { ownerId: string }) => e.ownerId === "DEMO-STAFF",
    ),
  ).toBe(true);
  const e = await (await request.get("/api/enquiries/DEMO-12")).json();
  expect(
    (
      await command(request, e.id, e.revision, {
        type: "reverse",
        paymentId: e.payments[0].id,
        reason: "Unauthorized",
      })
    ).status(),
  ).toBe(403);
  const trip = state.trips[0];
  expect(
    (
      await request.put(`/api/trips/${trip.id}`, {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: trip,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/enquiries", {
        data: { name: "Demo", tripId: trip.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/enquiries", {
        headers: {
          ...headers,
          Origin: "https://attacker.example",
          "Idempotency-Key": crypto.randomUUID(),
        },
        data: { name: "Demo", tripId: trip.id },
      })
    ).status(),
  ).toBe(403);
});
test("atomic optimistic edits, payment retries, and confirmation retries", async ({
  request,
}) => {
  const e = await (await request.get("/api/enquiries/DEMO-04")).json();
  const key = crypto.randomUUID();
  const payload = {
    type: "quote",
    total: 1000000,
    deposit: 200000,
    terms: "Synthetic API test quotation",
  };
  const first = await command(request, e.id, e.revision, payload, key);
  expect(first.status()).toBe(200);
  expect(
    (await command(request, e.id, e.revision, payload, key)).status(),
  ).toBe(200);
  expect(
    (
      await command(request, e.id, e.revision, {
        type: "note",
        text: "stale edit",
      })
    ).status(),
  ).toBe(409);
  let next = await (await request.get(`/api/enquiries/${e.id}`)).json();
  const results = await Promise.all([
    command(request, e.id, next.revision, {
      type: "note",
      text: "Concurrent A",
    }),
    command(request, e.id, next.revision, {
      type: "note",
      text: "Concurrent B",
    }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  next = await (await request.get(`/api/enquiries/${e.id}`)).json();
  expect(
    next.activities.filter((a: { text: string }) =>
      a.text.startsWith("Concurrent "),
    ),
  ).toHaveLength(1);
  const payment = {
    type: "payment",
    amount: 200000,
    date: new Date().toISOString(),
    reference: "Synthetic API transfer",
  };
  const payKey = crypto.randomUUID();
  const paymentRevision = next.revision;
  expect(
    (await command(request, e.id, paymentRevision, payment, payKey)).status(),
  ).toBe(200);
  expect(
    (await command(request, e.id, paymentRevision, payment, payKey)).status(),
  ).toBe(200);
  next = await (await request.get(`/api/enquiries/${e.id}`)).json();
  expect(next.payments).toHaveLength(1);
  expect(next.payments[0].status).toBe("pending");
  expect(
    (await command(request, e.id, next.revision, { type: "confirm" })).status(),
  ).toBe(400);
  await request.post("/api/local/session", {
    headers,
    data: { role: "staff" },
  });
  expect(
    (
      await command(request, e.id, next.revision, {
        type: "verify",
        paymentId: next.payments[0].id,
      })
    ).status(),
  ).toBe(200);
  next = await (await request.get(`/api/enquiries/${e.id}`)).json();
  expect(next.booking).toBeUndefined();
  const confirmKey = crypto.randomUUID();
  const confirmed = await command(
    request,
    e.id,
    next.revision,
    { type: "confirm" },
    confirmKey,
  );
  expect(confirmed.status()).toBe(200);
  expect(
    await (
      await command(
        request,
        e.id,
        next.revision,
        { type: "confirm" },
        confirmKey,
      )
    ).json(),
  ).toEqual(await confirmed.json());
  const final = await (await request.get(`/api/enquiries/${e.id}`)).json();
  expect(final.booking.actor).toBe("Demo staff");
  expect(
    final.activities.filter((a: { type: string }) => a.type === "booking"),
  ).toHaveLength(1);
  expect(
    (
      await command(
        request,
        e.id,
        final.revision,
        { type: "note", text: "different" },
        payKey,
      )
    ).status(),
  ).toBe(409);
});
test("private receipt ownership, invalid file rejection and no automatic verification", async ({
  request,
}) => {
  let e = await (await request.get("/api/enquiries/DEMO-PRIVATE")).json();
  expect(
    (
      await command(request, e.id, e.revision, {
        type: "quote",
        total: 100000,
        deposit: 20000,
        terms: "Synthetic attachment test terms",
      })
    ).status(),
  ).toBe(200);
  e = await (await request.get(`/api/enquiries/${e.id}`)).json();
  expect(
    (
      await command(request, e.id, e.revision, {
        type: "payment",
        amount: 10000,
        date: new Date().toISOString(),
        reference: "Synthetic unverified attachment test",
      })
    ).status(),
  ).toBe(200);
  e = await (await request.get(`/api/enquiries/${e.id}`)).json();
  // Synthetic file content, not a representation of a bank receipt.
  const key = crypto.randomUUID();
  const multipart = {
    paymentId: e.payments[0].id,
    file: {
      name: "synthetic-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nSynthetic upload test only\n%%EOF"),
    },
  };
  const upload = await request.post(`/api/enquiries/${e.id}/files`, {
    headers: { ...headers, "Idempotency-Key": key },
    multipart,
  });
  expect(upload.status()).toBe(201);
  const afterUpload = await (
    await request.get(`/api/enquiries/${e.id}`)
  ).json();
  expect(afterUpload.payments[0].status).toBe("pending");
  expect(afterUpload.booking).toBeUndefined();
  const file = await upload.json();
  const retry = await request.post(`/api/enquiries/${e.id}/files`, {
    headers: { ...headers, "Idempotency-Key": key },
    multipart,
  });
  expect(await retry.json()).toEqual(file);
  expect((await request.get(`/api/files/${file.id}`)).status()).toBe(200);
  const invalid = await request.post(`/api/enquiries/${e.id}/files`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    multipart: {
      file: {
        name: "fake.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("<html>invalid</html>"),
      },
    },
  });
  expect(invalid.status()).toBe(415);
  await request.post("/api/local/session", {
    headers,
    data: { role: "staff" },
  });
  expect((await request.get(`/api/files/${file.id}`)).status()).toBe(404);
  expect((await request.get(`/api/enquiries/${e.id}/files`)).status()).toBe(
    404,
  );
});
test("repeat enquiry reuses a customer and survives a new browser context", async ({
  request,
  browser,
}) => {
  const first = await (await request.get("/api/enquiries/DEMO-01")).json();
  const input = {
    name: first.name,
    tripId: first.tripId,
    customerId: first.customerId,
  };
  const key = crypto.randomUUID();
  const result = await request.post("/api/enquiries", {
    headers: { ...headers, "Idempotency-Key": key },
    data: input,
  });
  expect(result.status()).toBe(201);
  const created = await result.json();
  expect(
    await (
      await request.post("/api/enquiries", {
        headers: { ...headers, "Idempotency-Key": key },
        data: input,
      })
    ).json(),
  ).toEqual(created);
  const fresh = await browser.newContext();
  const response = await fresh.request.get(
    `${origin}/api/enquiries/${created.id}`,
  );
  const enquiry = await response.json();
  expect(enquiry.customerId).toBe(first.customerId);
  expect(enquiry.id).not.toBe(first.id);
  await fresh.close();
});
