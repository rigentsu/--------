import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrototypeSubsidy } from "../src/server/domain/costCalculator";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import { filterSupportResources } from "../src/server/domain/serviceFilter";
import { ConsultationConditionsSchema } from "../src/server/domain/schemas";

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

test("ホワイトリスト内の公営・民間の候補を複数残す", () => {
  const conditions = ConsultationConditionsSchema.parse({
    municipality: "新宿区",
    grade: "junior_high_2",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "unknown",
    monthly_budget: 30_000,
    annual_income: 0,
  });
  const result = filterSupportResources(conditions);

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((resource) => resource.category),
    ["public", "private"],
  );
  assert.ok(result.matches.every((resource) => resource.source_id === "miraitizu"));
  assert.ok(result.matches.every((resource) => resource.reasons.length > 0));
});
