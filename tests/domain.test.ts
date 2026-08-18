import assert from "node:assert/strict";
import test from "node:test";
import rawResources from "../src/data/miraitizu-resources.json";
import { calculatePrototypeSubsidy } from "../src/server/domain/costCalculator";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import { filterSupportResources } from "../src/server/domain/serviceFilter";
import { ConsultationConditionsSchema } from "../src/server/domain/schemas";
import type { SupportResource } from "../src/shared/types";

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
    },
  ] as SupportResource[]);

  assert.equal(partialResult.matches.length, 0);
  assert.equal(partialResult.review_candidates.length, 1);
  assert.ok(partialResult.review_candidates[0]?.source_url);
  assert.ok(
    partialResult.review_candidates[0]?.review_reasons.includes(
      "月額費用が情報源に明記されていません",
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
