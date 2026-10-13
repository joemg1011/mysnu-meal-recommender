import test from "node:test";
import assert from "node:assert/strict";
import { shiftDate, cleanOcrText } from "../lib/meal-utils.ts";

test("date arrows cross month and year boundaries", () => {
  assert.equal(shiftDate("2026-10-13", -1), "2026-10-12");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
});

test("OCR text removes headings and prices but keeps menu names", () => {
  const raw = "오늘 뭐 먹지?\n학생회관식당 08:00-19:00\n점심\n제육볶음 4,500원\n채소비빔밥 4,000원\n220동식당\n아침\n소고기미역국 5,000원";
  assert.equal(cleanOcrText(raw), "제육볶음\n채소비빔밥\n소고기미역국");
});
