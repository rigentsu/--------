import { z } from "zod";
import { GRADES, TIME_SLOTS } from "../../shared/types";

export const ConsultationConditionsSchema = z.object({
  municipality: z.string().trim().min(1),
  grade: z.enum(GRADES),
  preferred_times: z.array(z.enum(TIME_SLOTS)).min(1),
  can_pickup: z.enum(["yes", "no", "unknown"]),
  monthly_budget: z.number().finite().nonnegative(),
  annual_income: z.number().finite().nonnegative(),
});

export type ValidatedConditions = z.infer<typeof ConsultationConditionsSchema>;
