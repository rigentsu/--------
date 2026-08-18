import { z } from "zod";
import {
  GRADES,
  HOUSEHOLD_STATUSES,
  PRIORITY_NEEDS,
  TIME_SLOTS,
} from "../../shared/types";

function normalizePostalCode(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().replace(/[\s-]/g, "");
  return normalized.length === 0 ? undefined : normalized;
}

export const ConsultationConditionsSchema = z.object({
  municipality: z.string().trim().min(1),
  postal_code: z.preprocess(
    normalizePostalCode,
    z.string().regex(/^\d{7}$/, "郵便番号は7桁で入力してください。").optional(),
  ),
  grade: z.enum(GRADES),
  household_status: z.enum(HOUSEHOLD_STATUSES),
  preferred_times: z.array(z.enum(TIME_SLOTS)).min(1),
  can_pickup: z.enum(["yes", "no", "unknown"]),
  monthly_budget: z.number().finite().nonnegative(),
  annual_income: z.number().finite().nonnegative(),
  priority_need: z.enum(PRIORITY_NEEDS),
});

export type ValidatedConditions = z.infer<typeof ConsultationConditionsSchema>;

const MonthlyCostSchema = z.object({
  monthly_fee: z.number().finite().nonnegative(),
  annual_subsidy: z.number().finite().nonnegative(),
  monthly_subsidy: z.number().finite().nonnegative(),
  estimated_self_pay: z.number().finite().nonnegative(),
  formula_version: z.literal("prototype-v1"),
  prototype_only: z.literal(true),
});

const SupportResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source_id: z.string().min(1),
  source_label: z.string().min(1),
  category: z.enum(["public", "private"]),
  municipality: z.string(),
  address: z.string().nullable(),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  eligible_grades: z.array(z.enum(GRADES)),
  eligible_household_statuses: z.array(z.enum(HOUSEHOLD_STATUSES)),
  opening_times: z.array(z.enum(TIME_SLOTS)),
  can_pickup: z.boolean().nullable(),
  monthly_fee: z.number().finite().nonnegative().nullable(),
  subsidy_eligible: z.boolean(),
  supported_needs: z.array(z.enum(PRIORITY_NEEDS)),
  source_url: z.string().url(),
  verified_at: z.string().min(1),
  notes: z.array(z.string()),
  data_status: z.enum([
    "demo_unverified",
    "ai_extracted_unverified",
    "manually_verified",
  ]),
});

const DistanceSchema = z.number().finite().nonnegative().nullable();

export const FilterResultSchema = z.object({
  matches: z.array(
    SupportResourceSchema.extend({
      distance_km: DistanceSchema,
      reasons: z.array(z.string()),
      verification_points: z.array(z.string()),
      cost: MonthlyCostSchema,
    }),
  ),
  review_candidates: z.array(
    SupportResourceSchema.extend({
      distance_km: DistanceSchema,
      review_reasons: z.array(z.string()).min(1),
    }),
  ),
  excluded_count: z.number().int().nonnegative(),
});

export const SearchRequestSchema = z
  .object({ conditions: ConsultationConditionsSchema })
  .strict();

export const SearchApiErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["INVALID_REQUEST", "SOURCE_ERROR"]),
  message: z.string(),
});
