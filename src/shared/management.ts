import { z } from "zod";
import {
  stages,
  type Enquiry,
  type Group,
  type Rank,
  type Visa,
} from "./domain";
export type Rule = {
  id: string;
  enabled: boolean;
  group: Exclude<Group, "unknown">;
  visa: "all" | "none";
  rank: Rank;
  explanation: string;
};
export const ruleSchema = z
  .object({
    id: z.string().min(1).max(80),
    enabled: z.boolean(),
    group: z.enum(["couple", "solo", "family", "friends"]),
    visa: z.enum(["all", "none"]),
    rank: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
    explanation: z.string().trim().min(1).max(250),
  })
  .strict();
export const rulesSchema = z
  .array(ruleSchema)
  .min(1)
  .max(24)
  .superRefine((rules, ctx) => {
    const ids = new Set<string>(),
      matches = new Set<string>();
    for (const rule of rules) {
      if (ids.has(rule.id))
        ctx.addIssue({ code: "custom", message: "Rule IDs must be unique." });
      ids.add(rule.id);
      const match = `${rule.group}:${rule.visa}`;
      if (rule.enabled && matches.has(match))
        ctx.addIssue({
          code: "custom",
          message: `Overlapping enabled rules for ${match}.`,
        });
      if (rule.enabled) matches.add(match);
    }
  });
export const defaultRules: Rule[] = [
  ...(["couple", "solo", "family", "friends"] as const),
].flatMap((group) =>
  (["all", "none"] as const).map((visa) => ({
    id: `${group}-${visa}`,
    group,
    visa,
    enabled: !(["family", "friends"].includes(group) && visa === "all"),
    rank: (group === "couple"
      ? visa === "all"
        ? "P1"
        : "P2"
      : group === "solo"
        ? visa === "all"
          ? "P4"
          : "P5"
        : visa === "all"
          ? "P3"
          : "P6") as Rank,
    explanation: `${group}; ${visa === "all" ? "all report Schengen visas" : "no visas reported"}`,
  })),
);
export function evaluateRules(rules: Rule[], group: Group, visa: Visa) {
  if (group === "unknown" || visa === "unknown" || visa === "some")
    return {
      rank: null,
      reason:
        "Needs qualification: confirm group and each traveller’s visa status.",
    };
  const matching = rules.filter(
    (r) => r.enabled && r.group === group && r.visa === visa,
  );
  if (matching.length !== 1)
    return {
      rank: null,
      reason: "Needs qualification: no unambiguous reviewed rule applies.",
    };
  return { rank: matching[0].rank, reason: matching[0].explanation };
}
export function ruleExamples(rules: Rule[]) {
  return (["couple", "solo", "family", "friends", "unknown"] as const).flatMap(
    (group) =>
      (["all", "none", "some", "unknown"] as const).map((visa) => ({
        group,
        visa,
        ...evaluateRules(rules, group, visa),
      })),
  );
}
export const eligibleForRecompute = (e: Enquiry) =>
  !["CONFIRMED", "LOST", "NOT_SUITABLE", "ON_HOLD"].includes(e.stage) &&
  !e.override;
export const stageCodes = Object.keys(stages) as (keyof typeof stages)[];
export function contrastOnWhite(hex: string) {
  const rgb =
    hex
      .slice(1)
      .match(/../g)
      ?.map((c) => parseInt(c, 16) / 255) || [];
  const linear = rgb.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return (
    1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05)
  );
}
const labelSchema = z.object({
  label: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .refine(
      (c) => contrastOnWhite(c) >= 4.5,
      "Choose a darker colour for readable badges.",
    ),
});
export const settingsSchema = z
  .object({
    version: z.number().int().nonnegative(),
    timezone: z.literal("Asia/Dubai"),
    businessStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    businessEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    defaultFollowupHours: z.number().int().min(1).max(720),
    reminderMinutes: z.number().int().min(0).max(1440),
    maxAttempts: z.number().int().min(1).max(10),
    jobsPaused: z.boolean(),
    recoveryHold: z.boolean(),
    outboundEnabled: z.literal(false),
    stages: z.record(
      z.enum(
        stageCodes as [
          (typeof stageCodes)[number],
          ...(typeof stageCodes)[number][],
        ],
      ),
      labelSchema,
    ),
  })
  .strict()
  .refine((s) => s.businessStart < s.businessEnd, {
    message: "Business end must be later than start.",
  })
  .refine((s) => new Set(s.workingDays).size === s.workingDays.length, {
    message: "Working days must be unique.",
  });
export type WorkspaceSettings = z.infer<typeof settingsSchema>;
const colors = [
  "#6d28d9",
  "#0e6975",
  "#1d4ed8",
  "#92400e",
  "#92400e",
  "#9a3412",
  "#166534",
  "#475569",
  "#991b1b",
  "#4b5563",
];
export const defaultSettings: WorkspaceSettings = {
  version: 0,
  timezone: "Asia/Dubai",
  businessStart: "09:00",
  businessEnd: "18:00",
  workingDays: [1, 2, 3, 4, 5],
  defaultFollowupHours: 24,
  reminderMinutes: 0,
  maxAttempts: 5,
  jobsPaused: false,
  recoveryHold: false,
  outboundEnabled: false,
  stages: Object.fromEntries(
    stageCodes.map((code, i) => [
      code,
      { label: stages[code], color: colors[i] },
    ]),
  ) as WorkspaceSettings["stages"],
};
export type Job = {
  id: string;
  kind: "task_due" | "backup";
  task_id: string | null;
  enquiry_id: string | null;
  due_at: string;
  status:
    | "pending"
    | "queued"
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "held";
  attempts: number;
  dispatch_attempts: number;
  next_retry_at: string;
  last_error: string | null;
  updated_at: string;
  created_at: string;
};
export type RulePreview = {
  id: string;
  tripId: string;
  tripVersion: number;
  rules: Rule[];
  examples: ReturnType<typeof ruleExamples>;
  rows: {
    id: string;
    name: string;
    revision: number;
    before: Rank | null;
    after: Rank | null;
    reason: string;
    preserved: boolean;
  }[];
  expiresAt: string;
};
export type BackupRun = {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  checksum: string | null;
  counts: string | null;
  last_error: string | null;
};
