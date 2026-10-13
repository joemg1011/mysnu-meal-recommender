import test from "node:test";
import assert from "node:assert/strict";
import { estimateCalories } from "../lib/calories.ts";

test("public 1-serving reference beats generic rice-bowl rule", () => {
  const result = estimateCalories("제육덮밥");
  assert.equal(result.kcal, 782);
  assert.equal(result.confidence, "보통");
  assert.ok(result.sourceUrl);
});

test("soup with rice is not treated as soup alone", () => {
  assert.ok(estimateCalories("스팸김치찌개(밥포함)").kcal > estimateCalories("김치찌개").kcal);
});

test("side dishes and grain bowls have different portions", () => {
  assert.equal(estimateCalories("계란후라이").kcal, 90);
  assert.ok(estimateCalories("연어샐러드포케").kcal > estimateCalories("연어샐러드").kcal);
  assert.ok(estimateCalories("샐러드파스타").kcal > estimateCalories("채소샐러드").kcal);
});

test("food between angle brackets remains a food", () => {
  assert.ok(estimateCalories("<경성 돈카츠>").kcal > 0);
});

test("unknown and buffet entries do not invent a calorie figure", () => {
  assert.equal(estimateCalories("TAKE-OUT").kcal, null);
  assert.equal(estimateCalories("신메뉴").kcal, null);
  assert.equal(estimateCalories("뷔페+반찬+국+밥+음료").kcal, null);
});

test("two dish menu has a wide portion-aware range", () => {
  const result = estimateCalories("등심돈가스&숏파스타");
  assert.ok(result.kcal > 800);
  assert.ok(result.high - result.low > 500);
});
