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

export type ConsultationConditions = {
  municipality: string;
  grade: Grade;
  preferred_times: TimeSlot[];
  can_pickup: PickupPreference;
  monthly_budget: number;
  annual_income: number;
};

export type SupportResource = {
  id: string;
  name: string;
  source_id: "miraitizu";
  category: "public" | "private";
  municipality: string;
  eligible_grades: Grade[];
  opening_times: TimeSlot[];
  can_pickup: boolean | null;
  monthly_fee: number | null;
  source_url: string;
  verified_at: string;
  notes: string[];
  data_status: "demo_unverified" | "manually_verified";
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
  reasons: string[];
  verification_points: string[];
  cost: MonthlyCost;
};

export type FilterResult = {
  matches: FilteredResource[];
  excluded_count: number;
};
