import type {
  ConsultationConditions,
  Grade,
  PickupPreference,
  TimeSlot,
} from "../../shared/types";

const gradePatterns: Array<[RegExp, Grade]> = [
  [/小学1年|小学１年|小1/, "elementary_1"],
  [/小学2年|小学２年|小2/, "elementary_2"],
  [/小学3年|小学３年|小3/, "elementary_3"],
  [/小学4年|小学４年|小4/, "elementary_4"],
  [/小学5年|小学５年|小5/, "elementary_5"],
  [/小学6年|小学６年|小6/, "elementary_6"],
  [/中学1年|中学１年|中1/, "junior_high_1"],
  [/中学2年|中学２年|中2/, "junior_high_2"],
  [/中学3年|中学３年|中3/, "junior_high_3"],
];

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
  );
}

function parseMoney(value: string, unit?: string) {
  const numeric = Number(normalizeDigits(value).replace(/,/g, ""));
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

  if (/葛飾区/.test(input)) parsed.municipality = "葛飾区";
  else if (/新宿区/.test(input)) parsed.municipality = "新宿区";

  const grade = gradePatterns.find(([pattern]) => pattern.test(input));
  if (grade) parsed.grade = grade[1];

  if (/ひとり親|ひとり親世帯/.test(input)) {
    parsed.household_status = "single_parent";
  } else if (/完全無料|無料で利用|費用をかけず/.test(input)) {
    parsed.household_status = "free";
  } else if (/助成金|補助金|助成対象/.test(input)) {
    parsed.household_status = "subsidy";
  }

  const timeSlots: TimeSlot[] = [];
  if (/平日/.test(input) && !/夜|夜間|夕方/.test(input)) {
    timeSlots.push("weekday_afternoon");
  }
  if (/夜|夜間|夕方/.test(input)) timeSlots.push("weekday_evening");
  if (/土曜|土曜日|日曜|日曜日|週末/.test(input)) {
    timeSlots.push("saturday_morning");
  }
  if (timeSlots.length > 0) parsed.preferred_times = timeSlots;

  let pickup: PickupPreference | undefined;
  if (/送迎できない|送迎はできない|送迎不可|送迎は難しい|送迎できません|送迎はできません/.test(input)) {
    pickup = "no";
  }
  if (/送迎できる|送迎可能|送迎できます|送迎はできます/.test(input)) pickup = "yes";
  if (pickup) parsed.can_pickup = pickup;

  const monthlyBudget = findMoney(
    input,
    /月(?:額|に|の)?[^0-9０-９]{0,8}([0-9０-９,]+)\s*(万円|万|円)?/,
  );
  if (monthlyBudget !== undefined) parsed.monthly_budget = monthlyBudget;

  const annualIncome = findMoney(
    input,
    /年収[^0-9０-９]{0,8}([0-9０-９,]+)\s*(万円|万|円)?/,
  );
  if (annualIncome !== undefined) parsed.annual_income = annualIncome;

  if (/学校に知られず|匿名|誰にも知られず/.test(input)) {
    parsed.priority_need = "stage1_anonymous";
  } else if (/居場所|進路|学び場|フリースクール|教育支援/.test(input)) {
    parsed.priority_need = "stage2_places";
  } else if (/一人の時間|ひとりの時間|静かな場所|息抜き/.test(input)) {
    parsed.priority_need = "respite";
  } else if (/親の会|当事者交流|きょうだい|兄弟/.test(input)) {
    parsed.priority_need = "family_peer";
  }

  return parsed;
}
