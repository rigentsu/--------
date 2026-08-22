import { z } from "zod";
import {
  GRADES,
  HOUSEHOLD_STATUSES,
  PRIORITY_NEEDS,
  TIME_SLOTS,
} from "../../shared/types";

/**
 * The only fields that the model is allowed to extract from a supplement.
 * Search and cost decisions remain deterministic application logic.
 */
export const ExtractedConditionsSchema = z
  .object({
    municipality: z.string().trim().min(1).max(80).optional(),
    grade: z.enum(GRADES).optional(),
    household_status: z.enum(HOUSEHOLD_STATUSES).optional(),
    preferred_times: z.array(z.enum(TIME_SLOTS)).min(1).max(3).optional(),
    can_pickup: z.enum(["yes", "no", "unknown"]).optional(),
    monthly_budget: z.number().finite().nonnegative().max(100_000_000).optional(),
    annual_income: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    priority_need: z.enum(PRIORITY_NEEDS).optional(),
  })
  .strict();

export const ConsultationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const FoundryOutputSchema = z
  .object({
    conditions: ExtractedConditionsSchema,
    assistant_message: z
      .string()
      .trim()
      .max(1_000)
      .optional()
      .default("補足情報を反映しました。内容を確認してから検索してください。"),
  })
  .strict();

export const FoundryChatCompletionSchema = z
  .object({
    choices: z
      .array(
        z.object({
          message: z.object({
            content: z.string().nullable().optional(),
          }),
        }),
      )
      .min(1),
  })
  .passthrough();

export const FoundryResponsesSchema = z
  .object({
    output_text: z.string().nullable().optional(),
    output: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const ConsultApiSuccessSchema = z.object({
  ok: z.literal(true),
  conditions: ExtractedConditionsSchema,
  assistant_message: z.string(),
  source: z.literal("foundry"),
});

export const ConsultApiErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["INVALID_REQUEST", "FOUNDRY_NOT_CONFIGURED", "FOUNDRY_ERROR"]),
  message: z.string(),
});

export const ConsultApiResponseSchema = z.discriminatedUnion("ok", [
  ConsultApiSuccessSchema,
  ConsultApiErrorSchema,
]);

export type ExtractedConditions = z.infer<typeof ExtractedConditionsSchema>;
export type ConsultationRequest = z.infer<typeof ConsultationRequestSchema>;
export type FoundryOutput = z.infer<typeof FoundryOutputSchema>;
export type ConsultApiResponse = z.infer<typeof ConsultApiResponseSchema>;

function compactModelValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-・]/g, "");
}

function normalizeResourceName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "情報源から抽出した支援情報";
  }
  return value.trim();
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function normalizeSourceResourceAliases(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const addressAliases = [
    record.address,
    record["住所"],
    record["所在地"],
    record["施設住所"],
  ];
  const address = addressAliases.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  return {
    ...record,
    address: address ?? null,
  };
}

function normalizeCategory(value: unknown) {
  if (value === null || value === undefined) return "private";
  if (typeof value !== "string") return value;

  const normalized = compactModelValue(value);
  if (
    normalized === "public" ||
    normalized.includes("公営") ||
    normalized.includes("自治体") ||
    normalized.includes("行政") ||
    normalized.includes("公共")
  ) {
    return "public";
  }
  if (
    normalized === "private" ||
    normalized.includes("民間") ||
    normalized.includes("民営")
  ) {
    return "private";
  }
  return "private";
}

function normalizeGrade(value: string) {
  const normalized = compactModelValue(value);
  if (/^elementary[1-6]$/.test(normalized)) return normalized;
  if (/^juniorhigh[1-3]$/.test(normalized)) return normalized;

  const digit = normalized.match(/[1-9]/)?.[0];
  if (!digit) return undefined;
  if (/^(小|小学|小学校)/.test(normalized)) return `elementary_${digit}`;
  if (/^(中|中学|中学校)/.test(normalized)) return `junior_high_${digit}`;
  return undefined;
}

function normalizeHouseholdStatus(value: string) {
  const normalized = compactModelValue(value);
  if (normalized === "all" || normalized.includes("全世帯") || normalized.includes("すべて")) {
    return "all";
  }
  if (normalized === "free" || normalized.includes("無料") || normalized.includes("無償")) {
    return "free";
  }
  if (
    normalized === "singleparent" ||
    normalized.includes("ひとり親") ||
    normalized.includes("母子") ||
    normalized.includes("父子")
  ) {
    return "single_parent";
  }
  if (normalized === "subsidy" || normalized.includes("助成") || normalized.includes("補助")) {
    return "subsidy";
  }
  return undefined;
}

function normalizeTimeSlot(value: string) {
  const normalized = compactModelValue(value);
  if (normalized === "weekdayafternoon" || (normalized.includes("平日") && normalized.includes("午後"))) {
    return "weekday_afternoon";
  }
  if (
    normalized === "weekdayevening" ||
    (normalized.includes("平日") && (normalized.includes("夕方") || normalized.includes("夜")))
  ) {
    return "weekday_evening";
  }
  if (
    normalized === "saturdaymorning" ||
    ((normalized.includes("土曜") || normalized.includes("土曜日")) && normalized.includes("午前"))
  ) {
    return "saturday_morning";
  }
  return undefined;
}

function normalizePriorityNeed(value: string) {
  const normalized = compactModelValue(value);
  if (normalized.includes("stage1") || normalized.includes("匿名") || normalized === "相談") {
    return "stage1_anonymous";
  }
  if (
    normalized.includes("stage2") ||
    normalized.includes("居場所") ||
    normalized.includes("学習支援") ||
    normalized.includes("学習場所")
  ) {
    return "stage2_places";
  }
  if (normalized.includes("respite") || normalized.includes("レスパイト") || normalized.includes("一時預かり")) {
    return "respite";
  }
  if (normalized.includes("familypeer") || normalized.includes("家族") || normalized.includes("ピア")) {
    return "family_peer";
  }
  return undefined;
}

function normalizeEnumList(value: unknown, normalize: (value: string) => string | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const normalized = normalize(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeMonthlyFee(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  if (value.includes("無料") || value.includes("無償")) return 0;
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

function normalizePickup(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = compactModelValue(value);
  if (["yes", "true", "あり", "可", "対応"].includes(normalized)) return true;
  if (["no", "false", "なし", "不可", "非対応"].includes(normalized)) return false;
  return null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = compactModelValue(value);
  return ["true", "yes", "はい", "あり", "対象", "可"].includes(normalized);
}

function normalizeNotes(value: unknown) {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

const SourceExtractionResourceFieldsSchema = z.object({
    name: z.preprocess(
      normalizeResourceName,
      z.string().trim().min(1).max(160),
    ),
    category: z.preprocess(normalizeCategory, z.enum(["public", "private"])),
    municipality: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().trim().max(80),
    ),
    address: z.preprocess(
      normalizeAddress,
      z.string().trim().max(240).nullable(),
    ),
    eligible_grades: z.preprocess(
      (value) => normalizeEnumList(value, normalizeGrade),
      z.array(z.enum(GRADES)).max(GRADES.length),
    ),
    eligible_household_statuses: z.preprocess(
      (value) => normalizeEnumList(value, normalizeHouseholdStatus),
      z.array(z.enum(HOUSEHOLD_STATUSES)).max(HOUSEHOLD_STATUSES.length),
    ),
    opening_times: z.preprocess(
      (value) => normalizeEnumList(value, normalizeTimeSlot),
      z.array(z.enum(TIME_SLOTS)).max(TIME_SLOTS.length),
    ),
    can_pickup: z.preprocess(normalizePickup, z.boolean().nullable()),
    monthly_fee: z.preprocess(
      normalizeMonthlyFee,
      z.number().finite().nonnegative().nullable(),
    ),
    subsidy_eligible: z.preprocess(normalizeBoolean, z.boolean()),
    supported_needs: z
      .preprocess(
        (value) => normalizeEnumList(value, normalizePriorityNeed),
        z.array(z.enum(PRIORITY_NEEDS)).max(PRIORITY_NEEDS.length),
      ),
    notes: z.preprocess(
      normalizeNotes,
      z.array(z.string().trim().min(1).max(240)).max(4),
    ),
}).strip();

export const SourceExtractionResourceSchema = z.preprocess(
  normalizeSourceResourceAliases,
  SourceExtractionResourceFieldsSchema,
);

export const SourceExtractionOutputSchema = z
  .object({
    resources: z.array(SourceExtractionResourceSchema).max(30),
  })
  .strip();

export const DuplicateGroupsOutputSchema = z
  .object({
    duplicate_groups: z
      .array(z.array(z.string().trim().min(1)).min(2).max(10))
      .max(20),
  })
  .strip();

export type SourceExtractionResource = z.infer<typeof SourceExtractionResourceSchema>;
export type DuplicateGroupsOutput = z.infer<typeof DuplicateGroupsOutputSchema>;
