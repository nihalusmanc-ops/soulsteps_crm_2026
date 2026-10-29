import { type Enquiry, type Group, type Visa } from "./domain";
import { defaultRules, evaluateRules } from "./management";
import { type CallColour } from "./calling";

/** Explicit review fixtures. Reserved example contacts; never send messages. */
export function reviewSamples(
  tripId: string,
  ownerId: string,
  now = new Date(),
): Enquiry[] {
  const time = (hours: number) =>
    new Date(now.getTime() + hours * 3600000).toISOString();
  const base = (n: number, name: string, group: Group, visa: Visa): Enquiry => {
    const fit = evaluateRules(defaultRules, group, visa);
    return {
      id: `REVIEW-CALL-${String(n).padStart(2, "0")}`,
      customerId: `REVIEW-CUSTOMER-${n}`,
      name,
      email: `review${n}@example.invalid`,
      phone: `+120255501${String(n).padStart(2, "0")}`,
      tripId,
      ownerId,
      shared: true,
      sample: true,
      stage: "NEW",
      temperature: "unassessed",
      group,
      visa,
      travellers:
        group === "couple"
          ? 2
          : group === "solo"
            ? 1
            : group === "unknown"
              ? null
              : 4,
      rank: fit.rank,
      rankReason: fit.reason,
      response: "none",
      owner: "",
      source: "Review sample",
      createdAt: time(-48 + n),
      originalNote: "Sample enquiry for reviewing the calling workflow.",
      originalGroup: group,
      availability: "pending",
      tasks: [],
      activities: [],
      payments: [],
      revision: 0,
    };
  };
  const rows = [
    base(1, "Amina Noor", "unknown", "unknown"),
    base(2, "Adam & Sara", "couple", "all"),
    base(3, "Omar & Lina", "couple", "none"),
    base(4, "Maya Joseph", "solo", "all"),
    base(5, "Rohan's family", "family", "all"),
    base(6, "Zara Ahmed", "solo", "none"),
    base(7, "David's family", "family", "none"),
    base(8, "Leah's friends", "friends", "all"),
  ];
  const outcomes: [string, CallColour, string, number | null][] = [
    [
      "Nadia & Yusuf",
      "orange",
      "Very interested. Asked about the deposit and wants to discuss dates this afternoon.",
      3,
    ],
    [
      "Emma's family",
      "yellow",
      "Interested; itinerary sent. Will discuss it with the family and call back.",
      26,
    ],
    [
      "Arjun Shah",
      "purple",
      "Explained the trip. Wants time to consider; itinerary not sent yet.",
      null,
    ],
    [
      "Hana Malik",
      "pink",
      "Answered while at work and could not talk. Asked for an evening call.",
      7,
    ],
    [
      "Oliver Reed",
      "cyan",
      "First call unanswered. Try again when available.",
      null,
    ],
    [
      "Aisha Khan",
      "blue",
      "Three calls unanswered on separate occasions. Staff chose repeated no answer.",
      null,
    ],
    [
      "Daniel Cole",
      "red",
      "Travel dates do not work. Asked us not to follow up about this trip.",
      null,
    ],
  ];
  outcomes.forEach(([name, colour, note, due], i) => {
    const e = base(
      i + 9,
      name,
      i === 1 ? "family" : i === 0 ? "couple" : "solo",
      i % 2 ? "none" : "all",
    );
    e.callColour = colour;
    e.currentNote = note;
    e.initialCallAt = time(-24);
    e.lastContact = time(-12);
    e.stage = colour === "red" ? "LOST" : "QUALIFYING";
    e.temperature =
      colour === "orange" ? "hot" : colour === "yellow" ? "warm" : "cold";
    e.response = ["cyan", "blue"].includes(colour) ? "no_answer" : "none";
    e.activities = [
      {
        id: `${e.id}-call`,
        type: "call",
        text: `${colour}: ${note}`,
        at: time(-12),
        actor: "Review sample",
      },
      {
        id: `${e.id}-note`,
        type: "note",
        text: note,
        at: time(-12),
        actor: "Review sample",
      },
    ];
    if (due !== null)
      e.tasks.push({
        id: `${e.id}-task`,
        type: "Follow-up",
        due: time(due),
        status: "pending",
        note,
      });
    rows.push(e);
  });
  const converted = base(16, "Sofia & Alex", "couple", "all");
  converted.callColour = "orange";
  converted.currentNote =
    "Deposit added. Confirm the remaining booking details.";
  converted.initialCallAt = time(-24);
  converted.lastContact = time(-6);
  converted.stage = "AWAITING_DEPOSIT";
  converted.quote = {
    id: "REVIEW-QUOTE-16",
    total: 1000000,
    deposit: 200000,
    currency: "AED",
    accepted: true,
    terms: "Sample amounts for review only.",
    issuedAt: time(-12),
  };
  converted.payments = [
    {
      id: "REVIEW-PAYMENT-16",
      amount: 200000,
      currency: "AED",
      date: time(-6),
      reference: "SAMPLE-DEPOSIT",
      status: "pending",
    },
  ];
  converted.activities = [
    {
      id: "REVIEW-PAYMENT-ACTIVITY",
      type: "payment",
      text: "Sample deposit recorded; booking not yet confirmed.",
      at: time(-6),
      actor: "Review sample",
    },
  ];
  rows.push(converted);
  return rows;
}
