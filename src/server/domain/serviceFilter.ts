import { isApprovedSourceUrl } from "../../config/sourceRegistry";
import type {
  FilterResult,
  FilteredResource,
  GeoPoint,
  ReviewResource,
  SupportResource,
} from "../../shared/types";
import type { ValidatedConditions } from "./schemas";
import { calculateMonthlyCost } from "./costCalculator";

function resourceMatches(
  resource: SupportResource,
  conditions: ValidatedConditions,
  cost: FilteredResource["cost"],
) {
  if (
    !isApprovedSourceUrl(resource.source_id, resource.source_url)
  ) {
    return false;
  }

  if (resource.municipality !== conditions.municipality) return false;
  if (!resource.eligible_grades.includes(conditions.grade)) return false;
  if (!resource.eligible_household_statuses.includes(conditions.household_status)) {
    return false;
  }
  if (conditions.household_status === "subsidy" && !resource.subsidy_eligible) {
    return false;
  }
  if (!resource.supported_needs.includes(conditions.priority_need)) return false;
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
  if (conditions.household_status === "free") reasons.push("完全無料の登録があります");
  if (conditions.household_status === "single_parent") {
    reasons.push("ひとり親世帯向け条件の登録があります");
  }
  if (conditions.household_status === "subsidy") {
    reasons.push("助成金対象として登録されたデモ項目です");
  }
  reasons.push("いま一番求めていることに対応する登録があります");
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

function buildReviewReasons(resource: SupportResource, origin: GeoPoint | null) {
  const reasons: string[] = [];
  if (!resource.municipality) reasons.push("地域が情報源に明記されていません");
  if (resource.eligible_grades.length === 0) {
    reasons.push("対象学年が情報源に明記されていません");
  }
  if (resource.eligible_household_statuses.length === 0) {
    reasons.push("世帯条件が情報源に明記されていません");
  }
  if (resource.opening_times.length === 0) {
    reasons.push("利用時間帯が情報源に明記されていません");
  }
  if (resource.monthly_fee === null) {
    reasons.push("月額費用が情報源に明記されていません");
  }
  if (resource.supported_needs.length === 0) {
    reasons.push("支援内容が情報源に明記されていません");
  }
  if (resource.can_pickup === null) {
    reasons.push("送迎条件は未確認です");
  }
  if (origin && !resource.address) {
    reasons.push("施設住所が情報源に明記されていません");
  } else if (
    origin &&
    (resource.latitude === null || resource.longitude === null)
  ) {
    reasons.push("施設住所から距離を計算できませんでした");
  }
  return reasons;
}

function calculateDistanceKm(
  origin: GeoPoint | null,
  resource: SupportResource,
) {
  if (
    !origin ||
    typeof resource.latitude !== "number" ||
    typeof resource.longitude !== "number"
  ) {
    return null;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(resource.latitude - origin.latitude);
  const longitudeDelta = toRadians(resource.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const resourceLatitude = toRadians(resource.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(resourceLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 10) / 10;
}

function sortByDistance<T extends { distance_km: number | null }>(resources: T[]) {
  return resources.sort((left, right) => {
    if (left.distance_km === null && right.distance_km === null) return 0;
    if (left.distance_km === null) return 1;
    if (right.distance_km === null) return -1;
    return left.distance_km - right.distance_km;
  });
}

function knownFieldsAreCompatible(
  resource: SupportResource,
  conditions: ValidatedConditions,
  cost: FilteredResource["cost"],
) {
  if (!isApprovedSourceUrl(resource.source_id, resource.source_url)) return false;
  if (resource.municipality && resource.municipality !== conditions.municipality) {
    return false;
  }
  if (
    resource.eligible_grades.length > 0 &&
    !resource.eligible_grades.includes(conditions.grade)
  ) {
    return false;
  }
  if (
    resource.eligible_household_statuses.length > 0 &&
    !resource.eligible_household_statuses.includes(conditions.household_status)
  ) {
    return false;
  }
  if (
    conditions.household_status === "subsidy" &&
    resource.eligible_household_statuses.length > 0 &&
    !resource.subsidy_eligible
  ) {
    return false;
  }
  if (
    resource.supported_needs.length > 0 &&
    !resource.supported_needs.includes(conditions.priority_need)
  ) {
    return false;
  }
  if (
    resource.opening_times.length > 0 &&
    !conditions.preferred_times.some((time) => resource.opening_times.includes(time))
  ) {
    return false;
  }
  if (conditions.can_pickup === "yes" && resource.can_pickup === false) {
    return false;
  }
  if (conditions.can_pickup === "no" && resource.can_pickup === true) {
    return false;
  }
  if (
    resource.monthly_fee !== null &&
    cost.estimated_self_pay > conditions.monthly_budget
  ) {
    return false;
  }
  return true;
}

export function filterSupportResources(
  conditions: ValidatedConditions,
  sourceResources: SupportResource[],
  origin: GeoPoint | null = null,
): FilterResult {
  const matches: FilteredResource[] = [];
  const reviewCandidates: ReviewResource[] = [];

  for (const resource of sourceResources) {
    const reviewReasons = buildReviewReasons(resource, origin);
    const cost =
      resource.monthly_fee === null
        ? null
        : calculateMonthlyCost(resource.monthly_fee, conditions.annual_income);

    if (
      !knownFieldsAreCompatible(
        resource,
        conditions,
        cost ?? calculateMonthlyCost(0, conditions.annual_income),
      )
    ) {
      continue;
    }

    if (reviewReasons.length > 0) {
      reviewCandidates.push({
        ...resource,
        distance_km: calculateDistanceKm(origin, resource),
        review_reasons: reviewReasons,
      });
      continue;
    }

    if (cost === null) continue;

    if (resourceMatches(resource, conditions, cost)) {
      matches.push({
        ...resource,
        distance_km: calculateDistanceKm(origin, resource),
        reasons: buildReasons(resource, conditions, cost),
        verification_points: buildVerificationPoints(resource),
        cost,
      });
    }
  }

  sortByDistance(matches);
  sortByDistance(reviewCandidates);

  return {
    matches,
    review_candidates: reviewCandidates,
    excluded_count: sourceResources.length - matches.length - reviewCandidates.length,
  };
}
