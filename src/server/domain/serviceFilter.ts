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
    `地区与输入一致：${resource.municipality}`,
    "学龄在登记的对象范围内",
    "至少有一个可利用时段与输入重合",
  ];

  if (conditions.can_pickup === "yes") reasons.push("登记信息显示可提供送迎");
  if (conditions.can_pickup === "no") reasons.push("登记信息没有要求送迎");
  if (resource.monthly_fee !== null && cost.estimated_self_pay <= conditions.monthly_budget) {
    reasons.push("按开发演示公式计算后，预计自付在月预算内");
  }

  return reasons;
}

function buildVerificationPoints(resource: SupportResource) {
  return [
    ...resource.notes,
    "请在首次联系时确认最新费用、名额和具体利用条件。",
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
