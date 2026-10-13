import { foodReferences } from "./mfds-foods.ts";

export type CalorieEstimate = {
  kcal: number | null;
  low: number | null;
  high: number | null;
  confidence: "보통" | "낮음" | "확인 필요" | "직접 입력";
  basis: string;
  sourceUrl?: string;
  perBasisKcal?: number;
  basisAmount?: number;
  amountUnit?: string;
};

type FoodReference = (typeof foodReferences)[number];
export const MFDS_DATABASE_URL = "https://various.foodsafetykorea.go.kr/nutrient/general/down/list.do";
export const MFDS_REFERENCE_URL = "https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22484";

// The 2026-08-28 MFDS food-DB snapshot is checked in as mfds-foods.ts.
// kcalPerBasis is not a serving calorie value: it must be scaled by the listed serving amount.
const references = new Map<string, FoodReference[]>();
function normalized(name: string) {
  return name.toLowerCase().replace(/돈까스|돈카츠|돈가츠/g, "돈가스")
    .replace(/계란/g, "달걀").replace(/자장/g, "짜장")
    .replace(/[\s_<>()·.,]/g, "");
}
for (const row of foodReferences) {
  if (row.name.includes("간편조리세트")) continue;
  const key = normalized(row.name);
  references.set(key, [...(references.get(key) || []), row]);
}

const legacyServingReferences: Record<string, number> = {
  제육덮밥: 782, 비빔밥: 707, 카레라이스: 672, 불고기덮밥: 669,
  짜장면: 797, 물냉면: 552, 비빔냉면: 623, 짬뽕: 688,
  우동: 422, 해물칼국수: 628, 오므라이스: 730
};

function rounded(value: number) { return Math.round(value / 10) * 10; }
function range(kcal: number, spread: number, basis: string, confidence: CalorieEstimate["confidence"], sourceUrl?: string): CalorieEstimate {
  return { kcal: rounded(kcal), low: rounded(kcal * (1 - spread)), high: rounded(kcal * (1 + spread)), confidence, basis, sourceUrl };
}
const unknown = (basis: string): CalorieEstimate => ({ kcal: null, low: null, high: null, confidence: "확인 필요", basis });

function sourceUrl(row: FoodReference) {
  return `https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd=${encodeURIComponent(row.code)}&searchRegionCd=ZZ&searchMonthCd=AVG`;
}

function referenceRank(row: FoodReference) {
  const usefulServing = row.servingAmount > row.basisAmount ? 0 : 10;
  const origin = row.origin.startsWith("산업체급식") ? 0
    : row.origin.startsWith("외식(분석") ? 1
      : row.origin.startsWith("외식(재료") ? 2
        : row.origin.startsWith("중고등학교") ? 3
          : row.origin.startsWith("가정식") ? 4 : 5;
  return usefulServing + origin;
}

function fromReference(key: string, approximate = false): CalorieEstimate | null {
  const rows = references.get(normalized(key));
  if (!rows?.length) return null;
  const row = [...rows].sort((a, b) => referenceRank(a) - referenceRank(b))[0];
  if (row.servingAmount <= row.basisAmount) {
    return { ...unknown(`식약처에 ${row.basisAmount}${row.unit}당 ${row.kcalPerBasis} kcal 값은 있지만 1인분 중량은 확인되지 않았어요. 먹은 양을 입력해 주세요.`),
      sourceUrl: sourceUrl(row), perBasisKcal: row.kcalPerBasis, basisAmount: row.basisAmount, amountUnit: row.unit };
  }
  const kcal = row.kcalPerBasis * row.servingAmount / row.basisAmount;
  const spread = approximate ? 0.45 : row.method === "분석" ? 0.25 : 0.35;
  const basis = `${approximate ? `유사 음식 '${row.name}' 참고(추가 재료·크기 미반영) · ` : ""}식약처 음식 DB ${row.origin}, ${row.kcalPerBasis} kcal/${row.basisAmount}${row.unit} × 참고 1인분 ${row.servingAmount}${row.unit}. 학식 실제 양·조리법은 다를 수 있어요.`;
  return { ...range(kcal, spread, basis, approximate ? "낮음" : "보통", sourceUrl(row)),
    perBasisKcal: row.kcalPerBasis, basisAmount: row.basisAmount, amountUnit: row.unit };
}

function rice(): CalorieEstimate {
  const row = references.get(normalized("쌀밥"))?.[0];
  if (!row) return unknown("밥의 기준 영양 자료를 찾지 못했어요.");
  return { ...range(row.kcalPerBasis * 200 / row.basisAmount, 0.3,
    `식약처 쌀밥 ${row.kcalPerBasis} kcal/${row.basisAmount}${row.unit} × 밥 200g 가정. 실제 공기 크기를 확인해 주세요.`, "낮음", sourceUrl(row)),
    perBasisKcal: row.kcalPerBasis, basisAmount: row.basisAmount, amountUnit: row.unit };
}

function food(name: string): CalorieEstimate {
  const raw = name.trim().replace(/[<>]/g, "");
  const text = normalized(raw);
  if (!text) return unknown("메뉴명이 없어 계산할 수 없어요.");
  if (/^(take-?out|side|bake|kangjung|키친\d+|포포\d+|음료|샐러드코너|셀프코너)$/i.test(text)
    || /메뉴외에도|준비되어|breaktime|뷔페특성상|세미뷔페|셀프코너|신메뉴|뷔페/.test(text)) {
    return unknown("안내 문구 또는 선택형 메뉴라 음식과 분량을 알 수 없어요.");
  }

  const riceIncluded = /밥\s*포함|공기밥\s*포함/.test(raw);
  const nameWithoutRice = raw.replace(/\(?\s*(?:공기)?밥\s*포함\s*\)?/g, "").trim();
  if (riceIncluded && !nameWithoutRice) return rice();
  if (riceIncluded) {
    const dish = food(nameWithoutRice);
    const side = rice();
    if (dish.kcal === null || side.kcal === null) return unknown(`밥은 약 ${side.kcal ?? "?"} kcal로 추정하지만 주메뉴의 구성·분량을 몰라 전체 합계를 표시하지 않아요.`);
    return { kcal: dish.kcal + side.kcal, low: (dish.low || 0) + (side.low || 0), high: (dish.high || 0) + (side.high || 0), confidence: "낮음", basis: `${dish.basis} + ${side.basis}`, sourceUrl: dish.sourceUrl };
  }

  if (/^(공기밥|쌀밥|백미밥|흰쌀밥)$/.test(text)) return rice();
  if (/^(계란후라이|계란프라이|달걀후라이|달걀프라이)$/.test(text)) {
    return range(90, 0.3, "달걀 1개와 조리 기름 소량을 가정한 추정치. 실제 기름 양을 확인해 주세요.", "낮음");
  }
  if (/^(삶은계란|삶은달걀|반숙계란|반숙달걀)$/.test(text)) {
    return range(75, 0.25, "달걀 1개(약 50g) 가정. 개수를 확인해 주세요.", "낮음");
  }

  const sizeUnknown = /\(\s*[SLR]\s*\)/i.test(raw);
  if (sizeUnknown) return unknown("메뉴에 S/L/R 크기가 표시됐지만 각 크기의 중량이 없어 같은 칼로리를 붙이지 않아요. 식당 제공량을 확인해 주세요.");
  const withoutSize = raw.replace(/\(\s*[SLR]\s*\)/gi, "").trim();
  const exact = fromReference(withoutSize, sizeUnknown);
  if (exact && exact.kcal !== null) return exact;
  const old = legacyServingReferences[normalized(withoutSize)];
  if (old) return { ...range(old, 0.35, "식품안전나라 외식 메뉴 1인분 참고값. 학식의 실제 분량은 확인되지 않았어요.", "낮음", MFDS_REFERENCE_URL), kcal: old };

  // Only map a few recognizable variants to named reference foods. Unspecified toppings are not silently ignored.
  const proxy = /김치찌개/.test(text) ? /스팸|햄/.test(text) ? "김치찌개_햄" : /참치/.test(text) ? "김치찌개_참치" : /삼겹/.test(text) ? "김치찌개_삼겹살" : "김치찌개_돼지고기"
    : /된장찌개/.test(text) ? /바지락/.test(text) ? "된장찌개_바지락" : "된장찌개_두부_호박"
    : /돈가스|돈까스|돈카츠|까츠/.test(text) && !/카레|우동|파스타|덮밥|면|국수|정식|세트/.test(text) ? /치즈/.test(text) ? "돈가스_치즈" : /등심/.test(text) ? "등심돈가스" : "돈가스_돼지안심"
      : /카레라이스/.test(text) ? "카레라이스_돼지고기"
        : /비빔밥/.test(text) && !/마라|튀김|장어|연어|우삼겹|불고기/.test(text) ? "비빔밥"
          : /막국수/.test(text) ? "막국수"
            : /쌀국수/.test(text) && !/튀김|마라|우삼겹|훈제|직화|비빔|냉/.test(text) ? "쌀국수"
              : null;
  if (proxy) {
    const similar = fromReference(proxy, true);
    if (similar?.kcal !== null && similar) return similar;
  }
  if (exact) return exact;
  return unknown("식약처 음식 DB에서 일치하는 1인분 자료를 찾지 못했어요. 실제 구성·분량이나 영양표시를 입력해 주세요.");
}

export function estimateCalories(name: string): CalorieEstimate {
  const cleaned = name.trim();
  if (!cleaned) return unknown("메뉴명이 없어 계산할 수 없어요.");
  const parts = cleaned.split(/\s*[+&]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length === 1) return food(parts[0]);
  if (parts.length > 3) return unknown("여러 음식이 묶인 식단입니다. 구성품별 양을 확인해 주세요.");
  const estimates = parts.map(food);
  if (estimates.some(item => item.kcal === null)) return unknown("세트 구성품 중 1인분을 확인할 수 없는 음식이 있어 합계를 표시하지 않아요.");
  if (estimates.filter(item => (item.kcal || 0) >= 400).length > 1) {
    return unknown("주요리 2개 이상의 세트는 각 음식의 제공량이 불명확해 임의로 0.75인분씩 계산하지 않아요.");
  }
  return {
    kcal: estimates.reduce((sum, item) => sum + (item.kcal || 0), 0),
    low: estimates.reduce((sum, item) => sum + (item.low || 0), 0),
    high: estimates.reduce((sum, item) => sum + (item.high || 0), 0),
    confidence: "낮음",
    basis: `구성품별 참고 1인분 합계: ${estimates.map((item, index) => `${parts[index]} ${item.kcal} kcal`).join(" + ")}. 실제 세트의 각 제공량은 다를 수 있어요.`
  };
}

export function userCalories(kcal: number): CalorieEstimate {
  return { kcal, low: kcal, high: kcal, confidence: "직접 입력", basis: "사용자가 확인한 영양표시 또는 분량을 바탕으로 직접 입력한 값이에요." };
}
