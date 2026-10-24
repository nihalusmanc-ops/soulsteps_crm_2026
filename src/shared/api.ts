import { z } from "zod";
import { commandSchema } from "./domain";

export type Identity = {
  id: string;
  name: string;
  role: "staff" | "manager";
  local: boolean;
};
export type StoredFile = {
  id: string;
  enquiryId: string;
  paymentId: string | null;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
};
export const mutationSchema = z
  .object({ revision: z.number().int().nonnegative(), command: commandSchema })
  .strict();
export const createSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    tripId: z.string().min(1),
    customerId: z.string().optional(),
  })
  .strict();
export const tripSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(150),
    destination: z.string().max(150),
    status: z.enum(["draft", "published", "inactive"]),
    description: z.string().max(8000),
    type: z.enum(["fixed", "bespoke"]),
    departure: z.string().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)),
    availabilityNote: z.string().max(4000),
    itinerary: z.string().max(20000),
    price: z.number().int().positive().max(100000000).nullable(),
    deposit: z.number().int().positive().max(100000000).nullable(),
    version: z.number().int().positive(),
    groupVisaPolicy: z.enum(["review", "P3", "P6"]),
  })
  .strict()
  .refine(
    (t) => t.price === null || t.deposit === null || t.deposit <= t.price,
    { message: "Deposit exceeds trip price" },
  );
