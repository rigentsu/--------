import type {
  ConsultationConditions,
  Grade,
  PickupPreference,
  TimeSlot,
} from "../../shared/types";

const gradePatterns: Array<[RegExp, Grade]> = [
  [/小学?一|小1/, "elementary_1"],
  [/小学?二|小2/, "elementary_2"],
  [/小学?三|小3/, "elementary_3"],
  [/小学?四|小4/, "elementary_4"],
  [/小学?五|小5/, "elementary_5"],
  [/小学?六|小6/, "elementary_6"],
  [/初一|中一|中1/, "junior_high_1"],
  [/初二|中二|中2/, "junior_high_2"],
  [/初三|中三|中3/, "junior_high_3"],
];

function parseMoney(value: string, unit?: string) {
  const numeric = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return undefined;
  return unit === "万" || unit === "万円" ? numeric * 10000 : numeric;
}

function findMoney(input: string, labelPattern: RegExp) {
  const match = input.match(labelPattern);
  if (!match) return undefined;
  return parseMoney(match[1], match[2]);
}

export function parseNaturalLanguage(
  input: string,
): Partial<ConsultationConditions> {
  const parsed: Partial<ConsultationConditions> = {};

  if (/新宿/.test(input)) parsed.municipality = "新宿区";

  const grade = gradePatterns.find(([pattern]) => pattern.test(input));
  if (grade) parsed.grade = grade[1];

  const timeSlots: TimeSlot[] = [];
  if (/平日|工作日|下午/.test(input)) timeSlots.push("weekday_afternoon");
  if (/晚上|晚间|夜间/.test(input)) timeSlots.push("weekday_evening");
  if (/周末|周六|周日|星期六|星期日/.test(input)) {
    timeSlots.push("saturday_morning");
  }
  if (timeSlots.length > 0) parsed.preferred_times = timeSlots;

  let pickup: PickupPreference | undefined;
  if (/不能送迎|无法送迎|不需要送迎|不能接送|不便送迎/.test(input)) pickup = "no";
  if (/可以送迎|能够送迎|可送迎|可以接送/.test(input)) pickup = "yes";
  if (pickup) parsed.can_pickup = pickup;

  const monthlyBudget = findMoney(
    input,
    /(?:每月|月度|月最多|预算)[^0-9０-９]{0,8}([0-9０-９,]+)\s*(万|万円|元|円)?/,
  );
  if (monthlyBudget !== undefined) parsed.monthly_budget = monthlyBudget;

  const annualIncome = findMoney(
    input,
    /年收入[^0-9０-９]{0,8}([0-9０-９,]+)\s*(万|万円|元|円)?/,
  );
  if (annualIncome !== undefined) parsed.annual_income = annualIncome;

  return parsed;
}
