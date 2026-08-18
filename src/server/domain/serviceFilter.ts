import rawResources from "../../data/miraitizu-resources.json";
import { isApprovedSourceUrl } from "../../config/sourceRegistry";
import type {
  FilterResult,
  FilteredResource,
  SupportResource,
} from "../../shared/types";
import type { ValidatedConditions } from "./schemas";
import { calculateMonthlyCost } from "./costCalculator";

const resources = rawResources as SupportResource[];

function resourceMatches(
  resource: SupportResource,
  conditions: ValidatedConditions,
  cost: FilteredResource["cost"],
) {
  if (
    resource.source_id !== "miraitizu" ||
    !isApprovedSourceUrl(resource.source_id, resource.source_url)
  ) {
    return false;
  }

  if (resource.municipality !== conditions.municipality) return false;
  if (!resource.eligible_grades.includes(conditions.grade)) return false;
  if (!conditions.preferred_times.some((time) => resource.opening_times.includes(time))) {
    return false;
  }
  if (conditions.can_pickup === "yes" && resource.can_pickup !== true) {
    return false;
  }
  if (conditions.can_pickup === "no" && resource.can_pickup === true) {
    return false;
  }

  return resource.monthly_fee !== null && cost.estimated_self_pay <= conditions.monthly_budget;
}

function buildReasons(
  resource: SupportResource,
  conditions: ValidatedConditions,
  cost: FilteredResource["cost"],
) {
  const reasons = [
    `地域が一致：${resource.municipality}`,
    "対象学年に含まれています",
    "利用できる時間帯が入力条件と重なっています",
  ];

  if (conditions.can_pickup === "yes") reasons.push("送迎対応の登録があります");
  if (conditions.can_pickup === "no") reasons.push("送迎を必須条件にしていません");
  if (resource.monthly_fee !== null && cost.estimated_self_pay <= conditions.monthly_budget) {
    reasons.push("仮計算式での見込み自己負担が月の予算内です");
  }

  return reasons;
}

function buildVerificationPoints(resource: SupportResource) {
  return [
    ...resource.notes,
    "初回連絡時に最新の料金、空き状況、利用条件を確認してください。",
  ];
}

export function filterSupportResources(
  conditions: ValidatedConditions,
): FilterResult {
  const matches: FilteredResource[] = [];

  for (const resource of resources) {
    if (resource.monthly_fee === null) continue;
    const cost = calculateMonthlyCost(resource.monthly_fee, conditions.annual_income);

    if (resourceMatches(resource, conditions, cost)) {
      matches.push({
        ...resource,
        reasons: buildReasons(resource, conditions, cost),
        verification_points: buildVerificationPoints(resource),
        cost,
      });
    }
  }

  return {
    matches,
    excluded_count: resources.length - matches.length,
  };
}
