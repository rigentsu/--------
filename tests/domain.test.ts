import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrototypeSubsidy } from "../src/server/domain/costCalculator";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import { filterSupportResources } from "../src/server/domain/serviceFilter";
import { ConsultationConditionsSchema } from "../src/server/domain/schemas";

test("prototype subsidy follows the documented formula", () => {
  assert.deepEqual(calculatePrototypeSubsidy(5_000_000), {
    annual_subsidy: 1_000_000,
    monthly_subsidy: 83_333,
    formula_version: "prototype-v1",
    prototype_only: true,
  });
  assert.throws(() => calculatePrototypeSubsidy(-1));
  assert.throws(() => calculatePrototypeSubsidy(Number.NaN));
});

test("natural language parser extracts the five core demo conditions", () => {
  const parsed = parseNaturalLanguage(
    "我住在新宿区，孩子是初二，平日下午可以利用，不能送迎，每月最多能负担 3 万元。",
  );

  assert.deepEqual(parsed, {
    municipality: "新宿区",
    grade: "junior_high_2",
    preferred_times: ["weekday_afternoon"],
    can_pickup: "no",
    monthly_budget: 30_000,
  });
});

test("filtering keeps multiple white-listed options", () => {
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
