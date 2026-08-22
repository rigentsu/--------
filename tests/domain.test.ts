import assert from "node:assert/strict";
import test from "node:test";
import rawResources from "../src/data/miraitizu-resources.json";
import { calculatePrototypeSubsidy } from "../src/server/domain/costCalculator";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import { filterSupportResources } from "../src/server/domain/serviceFilter";
import { ConsultationConditionsSchema } from "../src/server/domain/schemas";
import type { SupportResource } from "../src/shared/types";
import { OFFICIAL_SUPPORT_RESOURCES } from "../src/data/officialSupportResources";
import { selectUniqueResources } from "../src/server/domain/resourceDeduplication";

test("開発デモの補助計算は要求書の仮計算式に従う", () => {
  assert.deepEqual(calculatePrototypeSubsidy(5_000_000), {
    annual_subsidy: 1_000_000,
    monthly_subsidy: 83_333,
    formula_version: "prototype-v1",
    prototype_only: true,
  });
  assert.throws(() => calculatePrototypeSubsidy(-1));
  assert.throws(() => calculatePrototypeSubsidy(Number.NaN));
});

test("自然な日本語から5つの基本条件を抽出する", () => {
  const parsed = parseNaturalLanguage(
    "新宿区に住んでいて、子どもは中学2年生です。平日午後に利用でき、送迎はできません。月3万円まで負担できます。",
  );

  assert.deepEqual(parsed, {
    municipality: "新宿区",
    grade: "junior_high_2",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "no",
    monthly_budget: 30_000,
  });
});

test("葛飾区を地域として抽出する", () => {
  assert.equal(
    parseNaturalLanguage("葛飾区に住んでいて、平日午後に利用したいです。").municipality,
    "葛飾区",
  );
});

test("郵便番号を7桁へ正規化する", () => {
  const valid = ConsultationConditionsSchema.safeParse({
    municipality: "葛飾区",
    postal_code: "125-0061",
    grade: "junior_high_2",
    household_status: "all",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "unknown",
    monthly_budget: 30_000,
    annual_income: 0,
    priority_need: "stage2_places",
  });
  const invalid = ConsultationConditionsSchema.safeParse({
    municipality: "葛飾区",
    postal_code: "125-061",
    grade: "junior_high_2",
    household_status: "all",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "unknown",
    monthly_budget: 30_000,
    annual_income: 0,
    priority_need: "stage2_places",
  });

  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.postal_code, "1250061");
  assert.equal(invalid.success, false);
});

test("世帯状況といま一番求めていることも抽出する", () => {
  assert.deepEqual(
    parseNaturalLanguage("ひとり親世帯で、子どもの居場所と学び場を探したいです。"),
    {
      household_status: "single_parent",
      priority_need: "stage2_places",
    },
  );
});

test("ホワイトリスト内の公営・民間の候補を複数残す", () => {
  const conditions = ConsultationConditionsSchema.parse({
    municipality: "新宿区",
    grade: "junior_high_2",
    household_status: "all",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "unknown",
    monthly_budget: 30_000,
    annual_income: 0,
    priority_need: "stage2_places",
  });
  const result = filterSupportResources(conditions, [
    rawResources[0],
    {
      ...rawResources[1],
      source_id: "katsushikaku",
      source_label: "不登校支援（葛飾区）",
      source_url: "https://www.city.katsushika.lg.jp/kosodate/1000057/1002475/1042946/index.html",
    },
  ] as SupportResource[]);

  assert.equal(result.matches.length, 2);
  assert.equal(result.review_candidates.length, 0);
  assert.deepEqual(
    result.matches.map((resource) => resource.category),
    ["public", "private"],
  );
  assert.deepEqual(
    result.matches.map((resource) => resource.source_id),
    ["miraitizu", "katsushikaku"],
  );
  assert.ok(result.matches.every((resource) => resource.reasons.length > 0));

  const partialResult = filterSupportResources(conditions, [
    {
      ...rawResources[0],
      id: "partial-source-resource",
      municipality: "",
      address: null,
      latitude: null,
      longitude: null,
      eligible_grades: [],
      eligible_household_statuses: [],
      opening_times: [],
      monthly_fee: null,
      supported_needs: [],
      can_pickup: null,
    },
  ] as SupportResource[]);

  assert.equal(partialResult.matches.length, 0);
  assert.equal(partialResult.review_candidates.length, 0);
  assert.equal(partialResult.excluded_count, 1);

  const usefulPartialResult = filterSupportResources(conditions, [
    {
      ...rawResources[0],
      id: "grade-matched-partial-resource",
      monthly_fee: null,
      opening_times: [],
      supported_needs: [],
      can_pickup: null,
    },
  ] as SupportResource[]);

  assert.equal(usefulPartialResult.review_candidates.length, 1);
  assert.ok(
    usefulPartialResult.review_candidates[0]?.review_reasons.includes(
      "対象学年が一致しています",
    ),
  );
  assert.ok(
    usefulPartialResult.review_candidates[0]?.review_reasons.every(
      (reason) => !reason.includes("未確認") && !reason.includes("一致していません"),
    ),
  );

  const incompatiblePartialResult = filterSupportResources(conditions, [
    {
      ...rawResources[3],
      id: "night-only-partial-resource",
      source_id: "katsushikaku",
      source_label: "不登校支援（葛飾区）",
      source_url: "https://www.city.katsushika.lg.jp/kosodate/1000057/1002475/1042946/index.html",
      municipality: "",
      address: null,
      latitude: null,
      longitude: null,
      eligible_grades: [],
      eligible_household_statuses: [],
      opening_times: ["weekday_evening"],
      monthly_fee: null,
      supported_needs: [],
      can_pickup: null,
    },
  ] as SupportResource[]);

  assert.equal(incompatiblePartialResult.matches.length, 0);
  assert.equal(incompatiblePartialResult.review_candidates.length, 0);

  const distanceResult = filterSupportResources(
    conditions,
    [
      {
        ...rawResources[0],
        id: "far-resource",
        name: "遠い支援施設",
        category: "private",
        address: "東京都葛飾区の遠い施設",
        latitude: 35.68,
        longitude: 139.72,
      },
      {
        ...rawResources[0],
        id: "near-resource",
        name: "近い支援施設",
        address: "東京都葛飾区の近い施設",
        latitude: 35.75,
        longitude: 139.85,
      },
    ] as SupportResource[],
    { latitude: 35.75, longitude: 139.85 },
  );

  assert.deepEqual(
    distanceResult.matches.map((resource) => resource.id),
    ["near-resource", "far-resource"],
  );
  assert.equal(distanceResult.matches[0]?.distance_km, 0);
});

test("郵便番号から50kmを超える候補は検索結果にも要確認候補にも出さない", () => {
  const conditions = ConsultationConditionsSchema.parse({
    municipality: "新宿区",
    postal_code: "1250061",
    grade: "junior_high_2",
    household_status: "all",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "unknown",
    monthly_budget: 30_000,
    annual_income: 0,
    priority_need: "stage2_places",
  });
  const farResource = {
    ...rawResources[0],
    id: "far-away-resource",
    address: "大阪府大阪市",
    latitude: 34.6937,
    longitude: 135.5023,
  } as SupportResource;

  const result = filterSupportResources(
    conditions,
    [farResource],
    { latitude: 35.75, longitude: 139.85 },
  );

  assert.equal(result.matches.length, 0);
  assert.equal(result.review_candidates.length, 0);
  assert.equal(result.excluded_count, 1);
});

test("葛飾区の公式な基礎候補には公開住所と情報源がある", () => {
  assert.ok(OFFICIAL_SUPPORT_RESOURCES.length >= 2);
  assert.ok(
    OFFICIAL_SUPPORT_RESOURCES.every(
      (resource) =>
        resource.municipality === "葛飾区" &&
        resource.address?.startsWith("東京都葛飾区") &&
        resource.data_status === "manually_verified",
    ),
  );
});

test("モデルが同一内容と判断した候補は情報が最も完全な1件だけ残す", () => {
  const official = OFFICIAL_SUPPORT_RESOURCES[0] as SupportResource;
  const duplicate = {
    ...official,
    id: "ai-duplicate",
    name: "ふれあいスクール明石（総合教育センター）",
    address: null,
    eligible_grades: [],
    data_status: "ai_extracted_unverified",
  } as SupportResource;

  const result = selectUniqueResources(
    [duplicate, official],
    [[duplicate.id, official.id]],
  );

  assert.deepEqual(result.map((resource) => resource.id), [official.id]);
});
