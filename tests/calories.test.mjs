import test from "node:test";
import assert from "node:assert/strict";
import { estimateCalories } from "../lib/calories.ts";

test("MFDS per-100ml data is scaled by the reference serving amount", () => {
  const result = estimateCalories("제육볶음");
  assert.equal(result.kcal, 200); // 148 kcal / 100ml × 136.4ml, rounded to 10 kcal
  assert.equal(result.confidence, "보통");
  assert.match(result.basis, /136.4ml/);
  assert.match(result.sourceUrl, /D710-529000000-0001/);
});

test("an older one-serving reference remains a labeled fallback", () => {
  const result = estimateCalories("제육덮밥");
  assert.equal(result.kcal, 782);
  assert.equal(result.confidence, "낮음");
  assert.ok(result.sourceUrl);
});

test("rice-included stew adds rice separately", () => {
  const stew = estimateCalories("스팸김치찌개");
  const set = estimateCalories("스팸김치찌개(밥포함)");
  assert.equal(set.kcal, stew.kcal + estimateCalories("쌀밥").kcal);
  assert.match(set.basis, /밥 200g/);
});

test("rice assumption and matched dish source are visible", () => {
  const rice = estimateCalories("공기밥");
  assert.equal(rice.kcal, 330);
  assert.equal(rice.confidence, "낮음");
  assert.match(rice.basis, /200g 가정/);
  assert.equal(estimateCalories("계란후라이").kcal, 90);
  assert.ok(estimateCalories("<경성 돈카츠>").kcal > 0);
});

test("ambiguous combinations and unknown dishes no longer invent numbers", () => {
  for (const name of ["TAKE-OUT", "신메뉴", "뷔페+반찬+국+밥+음료", "등심돈가스&숏파스타", "돈가스비빔면", "훈제연어포케", "연어 비빔밥(S)", "연어 비빔밥(L)"]) {
    assert.equal(estimateCalories(name).kcal, null, name);
  }
});

test("named similar food is transparently a low-confidence proxy", () => {
  const result = estimateCalories("눈꽃치즈 돈까스");
  assert.ok(result.kcal > 500);
  assert.equal(result.confidence, "낮음");
  assert.match(result.basis, /유사 음식/);
  assert.ok(result.high - result.low > 400);
});

test("per-100g-only data stays unestimated but exposes a weight calculation basis", () => {
  const result = estimateCalories("마라탕");
  assert.equal(result.kcal, null);
  assert.equal(result.basisAmount, 100);
  assert.ok(result.perBasisKcal > 0);
  assert.equal(result.amountUnit, "g");
  assert.ok(result.sourceUrl);
});
