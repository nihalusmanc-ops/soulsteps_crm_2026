import { z } from "zod";
export const metaId = z.string().regex(/^\d{1,100}$/);
const field = z.string().trim().min(1).max(200);
export const metaMappingSchema = z
  .object({
    pageId: metaId,
    formId: metaId,
    version: z.number().int().nonnegative(),
    schemaVersion: z.enum(["v2", "v3"]),
    tripId: z.string().min(1).max(100),
    ownerId: z.string().min(1).max(100),
    enabled: z.boolean(),
    reviewed: z.literal(true),
    reason: z.string().trim().min(8).max(2000),
    fields: z
      .object({
        name: field,
        phone: field,
        email: field,
        group: field,
        visa: field,
        decisionTimeframe: field.optional(),
        travelSelection: field.optional(),
      })
      .strict(),
  })
  .strict();
export type MetaMapping = z.infer<typeof metaMappingSchema>;
export const metaLeadSchema = z
  .object({
    id: metaId,
    form_id: metaId,
    created_time: z.string().max(100),
    field_data: z
      .array(
        z.object({
          name: z.string().max(200),
          values: z.array(z.string().max(10000)).max(20),
        }),
      )
      .max(100),
  })
  .passthrough();
export type MetaLead = z.infer<typeof metaLeadSchema>;
export const syntheticPage = "990000000000001",
  syntheticForm = "990000000000002";
export function syntheticLead(id: string, formId = syntheticForm): MetaLead {
  return {
    id,
    form_id: formId,
    created_time: "2026-10-24T10:00:00+0000",
    platform: "synthetic",
    ad_id: "990000000000003",
    adset_id: "990000000000004",
    campaign_id: "990000000000005",
    field_data: [
      { name: "full_name", values: ["Fictional Meta traveller"] },
      { name: "phone_number", values: ["REDACTED"] },
      { name: "email", values: ["meta-fixture@example.invalid"] },
      { name: "group", values: ["family"] },
      { name: "visa", values: ["some"] },
      { name: "booking_timeframe", values: ["Considering later"] },
      { name: "travel_selection", values: ["Not selected"] },
    ],
  };
}
export type MetaStatus = {
  connection: {
    liveEnabled: boolean;
    credentialsReady: boolean;
    local: boolean;
    publicPath: string;
  };
  counts: { status: string; count: number }[];
  forms: {
    id: string;
    version: number;
    data: MetaMapping;
    last_scan_at: string | null;
    last_scan_count: number | null;
    cursor: string | null;
  }[];
  leads: {
    id: string;
    page_id: string;
    form_id: string;
    mode: string;
    status: string;
    attempts: number;
    last_error: string | null;
    received_at: string;
    enquiry_id: string | null;
    mapping_version: number | null;
  }[];
};
