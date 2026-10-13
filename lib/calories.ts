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
    const assumed = /밥|덮밥|비빔밥|라이스/.test(key) ? 450 : /마라탕|곰탕|갈비탕/.test(key) ? 550 : /탕|찌개|국/.test(key) ? 350 : /쌀국수|우동|냉면|국수|라멘/.test(key) ? 600 : /면|파스타/.test(key) ? 400 : /가스|구이|볶음/.test(key) ? 180 : /샐러드/.test(key) ? 300 : 250;
    return { ...range(row.kcalPerBasis * assumed / row.basisAmount, 0.5, `식약처 '${row.name}' ${row.kcalPerBasis} kcal/${row.basisAmount}${row.unit} × 일반 1인분 ${assumed}${row.unit} 가정. 실제 학식의 중량은 확인되지 않았어요.`, "낮음", sourceUrl(row)),
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

// These component weights and energy densities are explicit heuristics, not measured SNU recipes.
// Matched single-food values above come from MFDS; these recipe values are deliberately low confidence.
type Ingredient = { name: string; grams: number; per100g: number };
const ingredient = (name: string, grams: number, per100g: number): Ingredient => ({ name, grams, per100g });
const bowlRice = (grams = 200) => ingredient("밥", grams, 166); // MFDS 쌀밥: 166 kcal/100g
const veg = (grams = 80) => ingredient("채소", grams, 35);
const sauce = (grams = 30) => ingredient("소스·기름", grams, 200);
function modeled(parts: Ingredient[], title: string, spread = 0.55): CalorieEstimate {
  const kcal = parts.reduce((sum, part) => sum + part.grams * part.per100g / 100, 0);
  const formula = parts.map(part => `${part.name} ${part.grams}g×${part.per100g}kcal/100g`).join(" + ");
  return range(kcal, spread, `${title}: ${formula}. 중량·열량밀도는 일반적인 1인분 가정이며 식당 조리법은 확인되지 않았어요.`, "낮음");
}
function modeledFood(raw: string): CalorieEstimate {
  const text = normalized(raw);
  const main = /연어/.test(text) ? ingredient("연어", 100, 200)
    : /장어/.test(text) ? ingredient("장어", 100, 250)
      : /새우/.test(text) ? ingredient("새우", 100, 130)
        : /닭가슴살/.test(text) ? ingredient("닭가슴살", 100, 165)
          : /오리/.test(text) ? ingredient("오리", 100, 210)
            : /스팸|햄/.test(text) ? ingredient("햄", 80, 300)
              : /두부|순두부/.test(text) ? ingredient("두부", 120, 80)
                : /소고기|우삼겹|육회|불고기/.test(text) ? ingredient("고기", 100, 230)
                  : ingredient("주재료", 100, 190);
  if (/스팸|햄/.test(text) && text.length <= 5) return modeled([ingredient("햄", 50, 300)], "사이드 1조각 가정");
  if (/^(아메리카노|블랙커피)/.test(text)) return modeled([ingredient("커피", 350, 2)], "무가당 커피 1잔 가정", 0.5);
  if (/탄산음료|사이다|콜라|두유/.test(text)) return modeled([ingredient("음료", 350, /두유/.test(text) ? 55 : 42)], "음료 1잔(350ml에 해당하는 약 350g) 가정", 0.5);
  if (/김밥/.test(text)) return modeled([bowlRice(180), ingredient("달걀·햄·채소·김", 100, 145), sauce(8)], "김밥 1줄 가정", 0.5);
  if (/컵밥|도시락/.test(text)) return modeled([bowlRice(), main, veg(80), sauce(30)], "컵밥·도시락 1개 가정");
  if (/솥밥/.test(text)) return modeled([bowlRice(200)], "솥밥 한 공기 가정", 0.4);
  if (/연두부|온두부/.test(text)) return modeled([ingredient("두부", 150, 80)], "두부 150g 가정", 0.5);
  if (/산적/.test(text)) return modeled([ingredient("고기·채소 산적", 120, 210)], "산적 2꼬치, 총 120g 가정");
  if (/새우까스/.test(text)) return modeled([ingredient("새우까스", 150, 250)], "새우까스 1개 150g 가정");
  if (/만두/.test(text)) return modeled([ingredient("만두", 180, 210)], "만두 6개, 총 180g 가정");
  if (/피자/.test(text)) return modeled([ingredient("피자", 300, 260)], "피자 2조각, 총 300g 가정");
  if (/김소떡|소떡/.test(text)) return modeled([ingredient("떡·소시지 꼬치", 130, 250)], "꼬치 1개 130g 가정");
  if (/팝콘볼/.test(text)) return modeled([ingredient("튀김 간식", 200, 270)], "팝콘볼 한 상자 200g 가정");
  if (/양념감자/.test(text)) return modeled([ingredient("감자튀김", 150, 280), sauce(25)], "작은 감자튀김 150g 가정");
  if (/도나쓰|도넛/.test(text)) return modeled([ingredient("도넛", 120, 330)], "도넛 1개 120g 가정");
  if (/치즈볼|치즈스틱|김말이|춘권|버팔로스틱/.test(text)) {
    const count = Math.min(10, Number(raw.match(/(\d+)\s*(?:조각|개|p)/i)?.[1] || 2));
    return modeled([ingredient("튀김 간식", count * 35, 300)], `${count}개, 개당 35g 가정`);
  }
  if (/치킨.*반마리|후라이드.*반마리/.test(text)) return modeled([ingredient("치킨 반마리(먹을 수 있는 부분)", 300, 280)], "반마리의 가식부 300g 가정", 0.55);
  if (/통다리|닭다리/.test(text) && !/국수|카레|덮밥/.test(text)) return modeled([ingredient("닭다리", 180, 220)], "닭다리 1개, 가식부 180g 가정");
  if (/강정/.test(text)) return modeled([ingredient("튀긴 고기·소스", /\(소\)/.test(raw) ? 180 : 250, 270)], "강정 소 180g, 일반 250g 가정");
  if (/베이크/.test(text)) return modeled([ingredient("빵·반죽", 130, 290), { ...main, grams: 90 }, ingredient("치즈·소스", 40, 280)], "베이크 1개 가정");
  if (/곰탕|떡국|닭개장|갈비탕/.test(text)) return modeled([ingredient("국물·채소", 300, 40), { ...main, grams: 120 }, ...(/떡국/.test(text) ? [ingredient("떡", 180, 220)] : [])], "국물 요리 한 그릇(밥 제외) 가정");
  if (/순두부/.test(text)) return modeled([ingredient("국물·채소", 200, 45), ingredient("순두부", 200, 80), ingredient("양념·기름", 25, 200)], "순두부찌개 한 그릇(밥 제외) 가정");
  if (/조림|두루치기|꿔바로우|함박스테이크|스키야키/.test(text)) return modeled([{ ...main, grams: 180 }, veg(80), sauce(35)], "주요리 1접시(밥 제외) 가정");
  if (/고로케|크로켓/.test(text)) {
    const count = Math.min(10, Number(raw.match(/(\d+)\s*[pP개]/)?.[1] || 1));
    return modeled([ingredient("튀김 고로케", 70 * count, 260)], `${count}개, 개당 70g 가정`);
  }
  if (/돈가스.*(면|국수|우동)|(?:면|국수|우동).*돈가스/.test(text)) return modeled([ingredient("익힌 면", 250, 150), ingredient("돈가스", 130, 280), veg(60), sauce(35)], "돈가스·면 한 그릇 가정");
  if (/돈가스.*카레|카레.*돈가스/.test(text)) return modeled([ingredient("돈가스", 140, 280), ingredient(/우동/.test(text) ? "익힌 우동면" : "밥", 220, /우동/.test(text) ? 140 : 166), ingredient("카레", 160, 120)], "돈가스 카레 한 그릇 가정");
  if (/새우튀김.*카레|카레.*새우튀김/.test(text)) return modeled([bowlRice(200), ingredient("새우튀김", 100, 230), ingredient("카레", 160, 120)], "새우튀김 카레 한 그릇 가정");
  if (/포케/.test(text)) return modeled([bowlRice(160), main, veg(120), ingredient("드레싱", 30, 270)], "포케 한 그릇 가정");
  if (/마요/.test(text)) return modeled([bowlRice(), main, ingredient("마요네즈", 25, 680), veg(40)], "마요 덮밥 한 그릇 가정");
  if (/비빔밥|덮밥|볶음밥|나시고랭|라이스|오므라이스/.test(text)) return modeled([bowlRice(), main, veg(100), sauce(35)], "밥 메뉴 한 그릇 가정");
  if (/찌개|탕|국|전골/.test(text)) return modeled([ingredient("국물·채소", 230, 45), main, ingredient("양념·기름", 25, 200)], "국물 요리 한 그릇(밥 제외) 가정");
  if (/쌀국수|우동|라멘|냉면|국수|칼국수|짬뽕|막국수|비빔면|볶음면|면/.test(text)) return modeled([ingredient("익힌 면", 250, 150), ingredient("국물·소스", 220, /비빔|볶음|마라/.test(text) ? 90 : 40), { ...main, grams: 70 }, veg(70)], "면 요리 한 그릇 가정");
  if (/파스타/.test(text)) return modeled([ingredient("익힌 파스타", 220, 160), ingredient("소스", 150, 130), { ...main, grams: 80 }], "파스타 한 접시 가정");
  if (/돈가스|까츠/.test(text)) return modeled([ingredient("튀긴 고기", 180, 280), ingredient("소스", 35, 120), veg(50), ...(/치즈/.test(text) ? [ingredient("치즈", 40, 300)] : [])], "돈가스 단품(밥 제외) 가정");
  if (/샐러드/.test(text)) return modeled([veg(180), { ...main, grams: 80 }, ingredient("드레싱", 30, 270)], "샐러드 한 접시 가정");
  if (/버거|샌드위치/.test(text)) return modeled([ingredient("빵", 90, 270), main, ingredient("소스·치즈", 40, 280), veg(40)], "버거·샌드위치 1개 가정");
  if (/떡볶이/.test(text)) return modeled([ingredient("떡", 200, 220), ingredient("양념", 100, 100), ingredient("어묵", 50, 150)], "떡볶이 한 접시 가정");
  if (/와플|크로플|빵|토스트|케이크/.test(text)) return modeled([ingredient("빵·반죽", 120, 320), ingredient("토핑", 30, 350)], "간식 1개 가정");
  if (/라떼|커피|주스|에이드|스무디|음료/.test(text)) return modeled([ingredient("음료", 350, 55)], "음료 1잔 가정");
  if (/구이|불고기|제육|볶음|치킨|튀김/.test(text)) return modeled([{ ...main, grams: 180 }, veg(50), sauce(30)], "주요리 1접시(밥 제외) 가정");
  if (/세트|정식|뷔페|부페|헬스팩/.test(text)) return modeled([bowlRice(180), { ...main, grams: 120 }, veg(150), ingredient("국·반찬·소스", 200, 80)], "세트의 대표적인 한 접시 가정", 0.65);
  if (/나물|반찬|김치|장아찌|피클/.test(text)) return modeled([ingredient("반찬", 80, 70)], "반찬 1접시 가정");
  return modeled([ingredient("일반 식사", 500, 130)], `메뉴 '${raw}'의 종류를 파악하지 못해 일반 식사 1인분을 적용`, 0.7);
}

function food(name: string): CalorieEstimate {
  const raw = name.trim().replace(/[<>]/g, "");
  const text = normalized(raw);
  if (!text) return unknown("메뉴명이 없어 계산할 수 없어요.");
  if (/^(take-?out|side|bake|kangjung|키친\d+|포포\d+|음료|셀프코너|신메뉴|바비든든|고기든든)$/i.test(text)
    || /메뉴외에도|준비되어|breaktime|뷔페특성상|운영시간|원산지|알레르기안내|순살변경|추가시|곱빼기메뉴/.test(text)
    || /^(?:take-?out|burger|chicken)카페?/i.test(text)) {
    return unknown("음식명이 아닌 안내·분류 항목이라 열량을 계산하지 않았어요.");
  }

  const size = raw.match(/\(\s*([SLR])\s*\)/i)?.[1]?.toUpperCase();
  if (size) {
    const base = food(raw.replace(/\(\s*[SLR]\s*\)/gi, "").trim());
    if (base.kcal === null) return base;
    const factor = size === "S" ? 0.75 : size === "L" ? 1.3 : 1;
    return { ...range(base.kcal * factor, 0.55, `${size} 크기는 기준 1인분의 ${factor}배 중량 가정(식당 중량 미확인). ${base.basis}`, "낮음", base.sourceUrl),
      perBasisKcal: base.perBasisKcal, basisAmount: base.basisAmount, amountUnit: base.amountUnit };
  }

  const riceIncluded = /밥\s*포함|공기밥\s*포함/.test(raw);
  const nameWithoutRice = raw.replace(/\(?\s*(?:공기)?밥\s*포함\s*\)?/g, "").trim();
  if (riceIncluded && !nameWithoutRice) return rice();
  if (riceIncluded) {
    const dish = food(nameWithoutRice);
    const side = rice();
    if (dish.kcal === null || side.kcal === null) return unknown("구성품이 음식이 아니라 합계를 계산할 수 없어요.");
    return { kcal: dish.kcal + side.kcal, low: (dish.low || 0) + (side.low || 0), high: (dish.high || 0) + (side.high || 0), confidence: "낮음", basis: `${dish.basis} + ${side.basis}`, sourceUrl: dish.sourceUrl };
  }

  if (/^(공기밥|쌀밥|백미밥|흰쌀밥)$/.test(text)) return rice();
  if (/^(계란후라이|계란프라이|달걀후라이|달걀프라이)$/.test(text)) {
    return modeled([ingredient("달걀", 50, 150), ingredient("조리 기름", 2, 750)], "달걀 1개 가정", 0.35);
  }
  if (/^(삶은계란|삶은달걀|반숙계란|반숙달걀)$/.test(text)) {
    return modeled([ingredient("달걀", 50, 150)], "달걀 1개 가정", 0.3);
  }

  const withoutSize = raw.replace(/\s*:\s*[\d,]+\s*원.*$/, "").trim();
  const composite = /돈가스.*(면|국수|우동|카레)|(?:면|국수|우동|카레).*돈가스|새우튀김.*카레|카레.*새우튀김|포케|마요|나시고랭/.test(normalized(withoutSize));
  if (composite) return modeledFood(withoutSize);
  const exact = fromReference(withoutSize);
  if (exact && exact.kcal !== null) return exact;
  const old = legacyServingReferences[normalized(withoutSize)];
  if (old) return { ...range(old, 0.4, `식품안전나라 외식 메뉴 참고 1인분 ${/면|국수/.test(withoutSize) ? "600g" : "450g"} 가정. 학식의 실제 중량은 확인되지 않았어요.`, "낮음", MFDS_REFERENCE_URL), kcal: old };

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
  return modeledFood(withoutSize);
}

export function estimateCalories(name: string): CalorieEstimate {
  const cleaned = name.trim();
  if (!cleaned) return unknown("메뉴명이 없어 계산할 수 없어요.");
  const foodDescription = /세트\s*[-–]/.test(cleaned)
    ? cleaned.replace(/^.*?세트\s*[-–]\s*/, "").split("=")[0].trim()
    : cleaned;
  const parts = foodDescription.split(/\s*[+&]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length === 1) return food(parts[0]);
  if (parts.length > 6) return modeledFood("뷔페 세트");
  const estimates = parts.map(food);
  if (estimates.some(item => item.kcal === null)) {
    if (/뷔페|부페/.test(cleaned)) return modeledFood("뷔페 세트");
    const edible = estimates.filter(item => item.kcal !== null);
    if (edible.length < 2) return modeledFood("뷔페 세트");
    return unknown("구성품 중 음식명이 아닌 항목이 있어 합계를 계산할 수 없어요.");
  }
  if (estimates.filter(item => (item.kcal || 0) >= 400).length > 1 && !/반마리|\d+\s*조각|\(소\)/.test(foodDescription)) {
    const scaled = estimates.map(item => (item.kcal || 0) >= 400 ? {
      ...item, kcal: rounded((item.kcal || 0) * 0.65), low: rounded((item.low || 0) * 0.65), high: rounded((item.high || 0) * 0.65)
    } : item);
    return {
      kcal: scaled.reduce((sum, item) => sum + (item.kcal || 0), 0),
      low: scaled.reduce((sum, item) => sum + (item.low || 0), 0),
      high: scaled.reduce((sum, item) => sum + (item.high || 0), 0),
      confidence: "낮음",
      basis: `세트 주요리 각각 기준 1인분 중량의 65% 가정: ${scaled.map((item, index) => `${parts[index]} ${item.kcal} kcal (${estimates[index].basis})`).join(" + ")}. 실제 제공량은 다를 수 있어요.`
    };
  }
  return {
    kcal: estimates.reduce((sum, item) => sum + (item.kcal || 0), 0),
    low: estimates.reduce((sum, item) => sum + (item.low || 0), 0),
    high: estimates.reduce((sum, item) => sum + (item.high || 0), 0),
    confidence: "낮음",
    basis: `구성품별 가정 1인분 합계: ${estimates.map((item, index) => `${parts[index]} ${item.kcal} kcal (${item.basis})`).join(" + ")}. 실제 세트의 각 제공량은 다를 수 있어요.`
  };
}

export function userCalories(kcal: number): CalorieEstimate {
  return { kcal, low: kcal, high: kcal, confidence: "직접 입력", basis: "사용자가 확인한 영양표시 또는 분량을 바탕으로 직접 입력한 값이에요." };
}
