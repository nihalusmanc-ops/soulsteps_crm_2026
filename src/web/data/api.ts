import type { Command, State, Trip } from "../../shared/domain";
import type { Identity, StoredFile } from "../../shared/api";
import type { CrmRepository } from "./repository";
const pendingKeys = new Map<string, string>();
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-Soulsteps-Request": "1",
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        code?: string;
      };
      message = body.message || message;
      code = body.code;
    } catch {
      /* Honest HTTP failure when Access returns a non-JSON login response. */
    }
    throw new ApiRequestError(message, response.status, code);
  }
  return response.json() as Promise<T>;
}
export async function mutate<T>(
  path: string,
  body: unknown,
  method = "POST",
): Promise<T> {
  const payload = JSON.stringify(body);
  const signature = `${method}:${path}:${payload}`;
  const key = pendingKeys.get(signature) || crypto.randomUUID();
  pendingKeys.set(signature, key);
  try {
    const result = await request<T>(path, {
      method,
      body: payload,
      headers: { "Idempotency-Key": key },
    });
    pendingKeys.delete(signature);
    return result;
  } catch (error) {
    throw error;
  }
}
export const apiRepository: CrmRepository = {
  read: () => request<State>("/state"),
  command: async (id: string, revision: number, command: Command) => {
    await mutate(`/enquiries/${id}/commands`, { revision, command });
  },
  saveTrip: async (trip: Trip) => {
    await mutate(`/trips/${trip.id}`, trip, "PUT");
  },
  create: async (name: string, tripId: string, customerId?: string) => {
    const response = await mutate<{ id: string }>("/enquiries", {
      name,
      tripId,
      ...(customerId ? { customerId } : {}),
    });
    return response.id;
  },
  reset: async () => {
    throw new Error("Persistent data cannot be reset from the browser.");
  },
};
export const session = {
  options: () => request<{ method: "access" | "password" }>("/auth/options"),
  login: (email: string, password: string) =>
    request<Identity>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST", body: "{}" }),
  passwordStatus: () =>
    request<{ hasPassword: boolean }>("/auth/password-status"),
  setPassword: (password: string, currentPassword?: string) =>
    request("/auth/password", {
      method: "POST",
      body: JSON.stringify({
        password,
        ...(currentPassword ? { currentPassword } : {}),
      }),
    }),
  me: () => request<Identity>("/me"),
  switchLocal: async (role: string) => {
    await request("/local/session", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },
};
export const receipts = {
  list: (id: string) => request<StoredFile[]>(`/enquiries/${id}/files`),
  upload: async (id: string, file: File, paymentId?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (paymentId) form.set("paymentId", paymentId);
    return request(`/enquiries/${id}/files`, {
      method: "POST",
      body: form,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  },
};
export const reports = () => request<State>("/reports");
