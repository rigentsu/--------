export const TIME_SLOTS = [
  "weekday_afternoon",
  "weekday_evening",
  "saturday_morning",
] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];

export const GRADES = [
  "elementary_1",
  "elementary_2",
  "elementary_3",
  "elementary_4",
  "elementary_5",
  "elementary_6",
  "junior_high_1",
  "junior_high_2",
  "junior_high_3",
] as const;

export type Grade = (typeof GRADES)[number];
export type PickupPreference = "yes" | "no" | "unknown";

export const HOUSEHOLD_STATUSES = [
  "all",
  "free",
  "single_parent",
  "subsidy",
] as const;

export type HouseholdStatus = (typeof HOUSEHOLD_STATUSES)[number];

export const PRIORITY_NEEDS = [
  "stage1_anonymous",
  "stage2_places",
  "respite",
  "family_peer",
] as const;

export type PriorityNeed = (typeof PRIORITY_NEEDS)[number];

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type ConsultationConditions = {
  municipality: string;
  postal_code: string;
  grade: Grade;
  household_status: HouseholdStatus;
  preferred_times: TimeSlot[];
  can_pickup: PickupPreference;
  monthly_budget: number;
  annual_income: number;
  priority_need: PriorityNeed;
};

export type SupportResource = {
  id: string;
  name: string;
  source_id: string;
  source_label: string;
  category: "public" | "private";
  municipality: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eligible_grades: Grade[];
  eligible_household_statuses: HouseholdStatus[];
  opening_times: TimeSlot[];
  can_pickup: boolean | null;
  monthly_fee: number | null;
  subsidy_eligible: boolean;
  supported_needs: PriorityNeed[];
  source_url: string;
  verified_at: string;
  notes: string[];
  data_status:
    | "demo_unverified"
    | "ai_extracted_unverified"
    | "manually_verified";
};

export type PrototypeSubsidy = {
  annual_subsidy: number;
  monthly_subsidy: number;
  formula_version: "prototype-v1";
  prototype_only: true;
};

export type MonthlyCost = PrototypeSubsidy & {
  monthly_fee: number;
  estimated_self_pay: number;
};

export type FilteredResource = SupportResource & {
  distance_km: number | null;
  reasons: string[];
  verification_points: string[];
  cost: MonthlyCost;
};

export type ReviewResource = SupportResource & {
  distance_km: number | null;
  review_reasons: string[];
};

export type FilterResult = {
  matches: FilteredResource[];
  review_candidates: ReviewResource[];
  excluded_count: number;
};
