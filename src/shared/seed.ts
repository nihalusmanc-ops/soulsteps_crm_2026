import sample from "../../samples/demo_enquiries.json";
import {
  applyCommand,
  classify,
  type Command,
  type Enquiry,
  type State,
  type Trip,
} from "./domain";

export function seed(): State {
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3600000).toISOString();
  const enquiries: Enquiry[] = sample.records.map((r, i) => {
    const fit = classify(
      r.group_type as Enquiry["group"],
      r.visa_summary as Enquiry["visa"],
    );
    const e: Enquiry = {
      id: r.id,
      customerId: `CUSTOMER-${i + 1}`,
      name: r.customer_name,
      email: r.email,
      phone: null,
      tripId: r.trip_id,
      stage: r.stage as Enquiry["stage"],
      temperature: r.temperature as Enquiry["temperature"],
      group: r.group_type as Enquiry["group"],
      visa: r.visa_summary as Enquiry["visa"],
      travellers:
        r.group_type === "couple" ? 2 : r.group_type === "solo" ? 1 : null,
      rank: fit.rank,
      rankReason: fit.reason,
      response: r.response_flag,
      owner: "Demo staff",
      source: i % 2 ? "Instagram" : "Facebook",
      createdAt: at(-24 * (i + 1)),
      lastContact: i ? at(-i * 12) : undefined,
      originalNote: r.note,
      originalGroup: r.group_type,
      availability: "pending",
      tasks: [],
      activities: [
        {
          id: `seed-${i}`,
          type: "source",
          text: "Fictional sample enquiry added. Original source note preserved.",
          actor: "Demo seed",
          at: at(-24 * (i + 1)),
        },
      ],
      payments: [],
      revision: 0,
    };
    if ([1, 2, 3, 5, 7].includes(i))
      e.tasks.push({
        id: `task-${i}`,
        type: i === 5 ? "Callback" : "Follow-up",
        due: at(i === 5 ? -3 : i === 1 ? -1 : i === 2 ? 1 : i === 3 ? 2 : 4),
        status: "pending",
        note:
          i === 5
            ? "Customer asked to discuss travel plans."
            : "Discuss next steps and qualification.",
      });
    if (i === 6) e.requestedCallback = "Weekend, time not yet agreed";
    if (i === 9)
      e.holdReason = "Fictional scenario: future travel, no date agreed.";
    if (i === 10) e.holdReason = "Fictional scenario: chose not to travel.";
    if (r.payment_scenario !== "none") {
      e.quote = {
        id: `quote-${i}`,
        total: 1200000,
        deposit: 300000,
        currency: "AED",
        accepted: true,
        terms:
          "FICTIONAL demo terms only: AED 12,000 total; AED 3,000 deposit. Not a Norway price.",
        issuedAt: at(-48),
      };
      e.payments = [
        {
          id: `payment-${i}`,
          amount: i === 4 ? 100000 : 300000,
          currency: "AED",
          date: at(-24),
          reference: `FICTIONAL-${i}`,
          status: "verified",
          verifier: "Demo seed",
          verifiedAt: at(-23),
        },
      ];
      e.activities.unshift({
        id: `funds-${i}`,
        type: "payment",
        text: "Fictional accepted quote and verified payment seeded for workflow testing.",
        actor: "Demo seed",
        at: at(-23),
      });
    }
    if (i === 8)
      e.booking = {
        reference: "SS-DEMO-09",
        confirmedAt: at(-20),
        actor: "Demo staff",
      };
    return e;
  });
  return {
    version: 1,
    enquiries,
    trips: [
      {
        id: "DEMO-NORWAY",
        name: "Norway · A northern escape",
        destination: "Norway",
        status: "draft",
        type: "fixed",
        description:
          "A dedicated workspace for the upcoming Norway journey. Qualify travellers and coordinate the next step while approved trip content is prepared.",
        departure: "",
        availabilityNote:
          "Check availability manually before making a commitment.",
        itinerary: "",
        price: null,
        deposit: null,
        version: 1,
        groupVisaPolicy: "review",
      },
    ],
  };
}
