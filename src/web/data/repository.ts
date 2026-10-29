import {
  applyCommand,
  type Command,
  type State,
  type Trip,
  type Group,
} from "../../shared/domain";
import { seed } from "../../shared/seed";
export { seed } from "../../shared/seed";
const key = "soulsteps-demo-v1";
export interface CrmRepository {
  read(signal?: AbortSignal): Promise<State>;
  command(id: string, revision: number, command: Command): Promise<void>;
  saveTrip(trip: Trip): Promise<void>;
  create(
    name: string,
    tripId: string,
    customerId?: string,
    contact?: { email: string; phone: string },
    qualification?: {
      group: Group;
      visa: "all" | "none" | "unknown";
      travellers: number | null;
    },
  ): Promise<string>;
  reset(): Promise<void>;
}
function readLocal(): State {
  const value = localStorage.getItem(key);
  if (!value) return seed();
  try {
    const parsed = JSON.parse(value) as State;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.enquiries) ||
      !Array.isArray(parsed.trips)
    )
      throw new Error();
    return parsed;
  } catch {
    throw new Error(
      "Demo storage cannot be read. Export or clear the soulsteps-demo-v1 browser storage key to start again.",
    );
  }
}
function write(state: State) {
  localStorage.setItem(key, JSON.stringify(state));
}
export const demoRepository: CrmRepository = {
  async read() {
    const s = readLocal();
    if (!localStorage.getItem(key)) write(s);
    return structuredClone(s);
  },
  async command(id, revision, command) {
    const s = readLocal();
    const index = s.enquiries.findIndex((e) => e.id === id);
    if (index < 0) throw new Error("Enquiry not found.");
    if (s.enquiries[index].revision !== revision)
      throw new Error(
        "This enquiry changed in another tab. Refresh and try again.",
      );
    s.enquiries[index] = applyCommand(
      s.enquiries[index],
      command,
      s.trips.find((t) => t.id === s.enquiries[index].tripId)?.groupVisaPolicy,
    );
    write(s);
  },
  async saveTrip(trip) {
    const s = readLocal();
    const index = s.trips.findIndex((t) => t.id === trip.id);
    if (index < 0) throw new Error("Trip not found.");
    if (s.trips[index].version !== trip.version)
      throw new Error("Trip changed. Refresh before saving.");
    if (!trip.name.trim()) throw new Error("Trip name is required.");
    if (
      (trip.price !== null &&
        (!Number.isSafeInteger(trip.price) || trip.price <= 0)) ||
      (trip.deposit !== null &&
        (!Number.isSafeInteger(trip.deposit) || trip.deposit <= 0))
    )
      throw new Error("Enter valid positive amounts or leave blank.");
    s.trips[index] = { ...trip, status: "draft", version: trip.version + 1 };
    write(s);
  },
  async create(name, tripId) {
    if (!name.trim()) throw new Error("Name is required.");
    const s = readLocal();
    const id = `DEMO-${crypto.randomUUID().slice(0, 8)}`;
    s.enquiries.unshift({
      id,
      customerId: crypto.randomUUID(),
      name: name.trim(),
      email: "",
      phone: null,
      tripId,
      stage: "NEW",
      temperature: "unassessed",
      group: "unknown",
      visa: "unknown",
      travellers: null,
      rank: null,
      rankReason: "Needs qualification: collect group and visa details.",
      response: "none",
      owner: "Demo staff",
      source: "Manual",
      createdAt: new Date().toISOString(),
      originalNote: "Manually created fictional demo enquiry.",
      originalGroup: "unknown",
      availability: "pending",
      tasks: [],
      payments: [],
      activities: [
        {
          id: crypto.randomUUID(),
          type: "source",
          text: "Fictional enquiry created manually.",
          at: new Date().toISOString(),
          actor: "Demo staff",
        },
      ],
      revision: 0,
    });
    write(s);
    return id;
  },
  async reset() {
    write(seed());
  },
};
