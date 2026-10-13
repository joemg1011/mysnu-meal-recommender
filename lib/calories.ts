export type CalorieEstimate = {
  kcal: number | null;
  low: number | null;
  high: number | null;
  confidence: "보통" | "낮음" | "확인 필요" | "직접 입력";
  basis: string;
  sourceUrl?: string;
};

// 식품안전나라의 외식 메뉴 1인분 참고값. 실제 학식의 조리법과 양은 다를 수 있다.
export const MFDS_REFERENCE_URL = "https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22484";
const references: Record<string, number> = {
  제육덮밥: 782, 비빔밥: 707, 카레라이스: 672, 불고기덮밥: 669,
  짜장면: 797, 자장면: 797, 물냉면: 552, 비빔냉면: 623,
  짬뽕: 688, 우동: 422, 해물칼국수: 628, 오므라이스: 730
};

function rounded(value: number) { return Math.round(value / 10) * 10; }

function range(kcal: number, spread: number, basis: string, confidence: CalorieEstimate["confidence"], sourceUrl?: string): CalorieEstimate {
  return { kcal: rounded(kcal), low: rounded(kcal * (1 - spread)), high: rounded(kcal * (1 + spread)), confidence, basis, sourceUrl };
}

const unknown = (basis: string): CalorieEstimate => ({ kcal: null, low: null, high: null, confidence: "확인 필요", basis });

function singleFood(name: string): CalorieEstimate {
  const text = name.replace(/[<>()]/g, " ").replace(/\s+/g, "").trim();
  if (!text) return unknown("메뉴명이 없어 계산할 수 없어요.");
  if (/^(TAKE-?OUT|SIDE|BAKE|KANGJUNG|키친\d+|포포\d+|음료|샐러드코너|셀프코너)$/i.test(text) || /메뉴외에도|준비되어|breaktime|뷔페특성상|세미뷔페|셀프코너/.test(text)) return unknown("안내 문구 또는 선택형 메뉴라 분량을 알 수 없어요.");

  const reference = references[text];
  if (reference) return { ...range(reference, 0.25, "식품안전나라 외식 메뉴 1인분 참고값; 학식 분량·조리법은 다를 수 있어요.", "보통", MFDS_REFERENCE_URL), kcal: reference };

  // 밥을 포함한 국물 메뉴는 국물 단품과 분리해 계산한다.
  if (/밥포함|공기밥포함/.test(text) && /찌개|국|탕|순두부/.test(text)) return range(550, 0.35, "찌개·국 1인분과 밥 1공기 포함 가정", "낮음");
  if (/계란후라이|달걀후라이|계란프라이/.test(text)) return range(90, 0.25, "달걀 1개와 조리 기름 소량 가정", "낮음");
  if (/반숙계란|삶은계란|삶은달걀/.test(text)) return range(75, 0.2, "달걀 1개 가정", "낮음");
  if (/^(공기밥|쌀밥|현미밥|잡곡밥|흑미밥)$/.test(text)) return range(300, 0.2, "밥 1공기 약 200g 가정", "낮음");
  if (/피클|단무지|깍두기|나물|김치$/.test(text) && !/볶음밥|덮밥|찌개|국|파스타/.test(text)) return range(45, 0.55, "반찬 소량 1접시 가정", "낮음");
  if (/아메리카노|블랙커피/.test(text)) return range(10, 0.8, "시럽 없는 1잔 가정", "낮음");
  if (/탄산음료|콜라|사이다/.test(text)) return range(140, 0.45, "일반 음료 약 350ml 가정", "낮음");
  if (/라떼|에이드|주스|쥬스/.test(text)) return range(180, 0.5, "음료 1잔; 당·우유 양 미확인", "낮음");
  if (/샐러드/.test(text) && !/파스타|포케|덮밥/.test(text)) return range(/닭|고기|치킨|연어|리코타/.test(text) ? 340 : 230, 0.5, "샐러드 1인분과 일반 드레싱 가정", "낮음");
  if (/포케/.test(text)) return range(550, 0.4, "곡물밥을 포함한 포케 1그릇 가정", "낮음");
  if (/파스타|리조또/.test(text)) return range(/크림|로제|까르보나라/.test(text) ? 760 : 650, 0.35, "파스타·리조또 1인분 가정", "낮음");
  if (/돈까스|돈가스|돈카츠|돈가츠|까츠/.test(text)) return range(/치즈/.test(text) ? 850 : 750, 0.35, "튀김 1인분; 밥 포함 여부 미확인", "낮음");
  if (/버거|햄버거/.test(text)) return range(/더블/.test(text) ? 700 : 520, 0.35, "버거 단품 1개 가정", "낮음");
  if (/비빔밥|덮밥|볶음밥|카레라이스|필라프|마요/.test(text)) return range(/제육|삼겹|치킨|고기|불고기/.test(text) ? 750 : 650, 0.35, "밥과 주재료를 포함한 1그릇 가정", "낮음");
  if (/카레/.test(text)) return range(650, 0.45, "카레 1인분; 밥 포함 여부 미확인", "낮음");
  if (/쌀국수|칼국수|라면|냉면|막국수|국수|짬뽕|짜장면|자장면|우동|수제비|소바|모밀|비빔면/.test(text)) return range(/짬뽕|짜장|자장|마라/.test(text) ? 700 : 570, 0.35, "면 요리 1그릇 가정", "낮음");
  if (/마라탕/.test(text)) return range(650, 0.5, "마라탕 1그릇; 선택 재료·중량 미확인", "낮음");
  if (/떡볶이/.test(text)) return range(500, 0.45, "떡볶이 1인분; 소스·토핑 미확인", "낮음");
  if (/찌개|순두부/.test(text)) return range(260, 0.45, "국물 요리 단품 1그릇; 밥 제외", "낮음");
  if (/국밥|곰탕|갈비탕|육개장|해장국/.test(text)) return range(600, 0.4, "국물 요리 1그릇과 밥 포함 가정", "낮음");
  if (/국|탕|장국/.test(text)) return range(260, 0.5, "국물 요리 단품 1그릇; 밥 제외", "낮음");
  if (/제육|불고기|갈비|닭갈비|치킨|닭볶음/.test(text)) return range(480, 0.45, "고기 요리 1접시; 밥 제외", "낮음");
  if (/김밥/.test(text)) return range(430, 0.35, "김밥 1줄 가정", "낮음");
  if (/두부/.test(text)) return range(180, 0.5, "두부 반찬 1접시 가정", "낮음");
  return unknown("음식 종류나 분량을 확인할 수 없어요.");
}

export function estimateCalories(name: string): CalorieEstimate {
  const cleaned = name.trim();
  if (!cleaned) return unknown("메뉴명이 없어 계산할 수 없어요.");
  const parts = cleaned.split(/\s*[+&]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    if (parts.length > 4) return unknown("여러 음식이 묶인 식단입니다. 구성품과 분량을 직접 입력해 주세요.");
    const estimates = parts.map(singleFood);
    if (estimates.some(item => item.kcal === null)) return unknown("세트의 구성품 중 분량을 추정할 수 없는 항목이 있어요.");
    const mainCount = estimates.filter(item => (item.kcal || 0) >= 400).length;
    const factor = mainCount > 1 ? 0.75 : 1;
    const total = estimates.reduce((sum, item) => sum + (item.kcal || 0), 0) * factor;
    return range(total, 0.45, mainCount > 1 ? "세트 구성품을 각각 0.75인분으로 가정" : "세트 구성품을 각각 1인분으로 가정", "낮음");
  }
  return singleFood(cleaned);
}

export function userCalories(kcal: number): CalorieEstimate {
  return { kcal, low: kcal, high: kcal, confidence: "직접 입력", basis: "사용자가 확인한 칼로리 또는 분량을 직접 입력했어요." };
}
