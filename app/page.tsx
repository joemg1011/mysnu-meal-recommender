"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { estimateCalories, userCalories } from "../lib/calories";

type Menu = {
  id: string;
  name: string;
  kcal: number | null;
  category: string;
  tags: string[];
  score: number;
  votes: number;
  confidence: "높음" | "보통" | "낮음" | "확인 필요" | "직접 입력";
  low?: number | null;
  high?: number | null;
  basis?: string;
  sourceUrl?: string;
  price?: number;
};

type Meal = {
  id: string;
  cafeteria: string;
  location: string;
  time: "조식" | "중식" | "석식";
  emoji: string;
  menu: Menu[];
};

type SavedUpload = Meal & { date: string };
type MealRecord = { id: string; name: string; category: string; cafeteria: string; kcal: number | null };
type LocalData = {
  version: 1;
  recordsByDate: Record<string, MealRecord[]>;
  votes: Record<string, "like" | "dislike">;
  target: string;
  preferredCategories: string[];
  allergies: string[];
  dislikedIngredients: string;
  uploads: SavedUpload[];
};

const LOCAL_DATA_KEY = "mysnu-local-data-v1";
const CATEGORY_OPTIONS = ["한식", "양식", "일식", "샐러드"];
const ALLERGY_OPTIONS = ["견과류", "갑각류", "유제품", "계란"];

function readLocalData(): LocalData | null {
  try {
    const data = JSON.parse(window.localStorage.getItem(LOCAL_DATA_KEY) || "null");
    if (data?.version !== 1) return null;
    return {
      version: 1,
      recordsByDate: data.recordsByDate && typeof data.recordsByDate === "object" ? data.recordsByDate : {},
      votes: data.votes && typeof data.votes === "object" ? data.votes : {},
      target: ["다이어트", "유지", "벌크업"].includes(data.target) ? data.target : "유지",
      preferredCategories: Array.isArray(data.preferredCategories) ? data.preferredCategories.filter((item: unknown) => CATEGORY_OPTIONS.includes(String(item))) : [],
      allergies: Array.isArray(data.allergies) ? data.allergies.filter((item: unknown) => ALLERGY_OPTIONS.includes(String(item))) : [],
      dislikedIngredients: typeof data.dislikedIngredients === "string" ? data.dislikedIngredients : "",
      uploads: Array.isArray(data.uploads) ? data.uploads.filter((meal: SavedUpload) => meal?.id?.startsWith("upload-") && Array.isArray(meal.menu)) : []
    };
  } catch { return null; }
}

function menuCategory(name: string) {
  if (/샐러드|포케/.test(name)) return "샐러드";
  if (/파스타|리조또|피자|버거|스테이크/.test(name)) return "양식";
  if (/카레|우동|돈까스|돈가스|소바|라멘|가츠/.test(name)) return "일식";
  if (/쌀국수|짜장|짬뽕|마라탕/.test(name)) return "기타";
  if (/밥|국|찌개|탕|제육|불고기|비빔|김치|나물|떡볶이/.test(name)) return "한식";
  return "기타";
}

const ALLERGY_NAME_HINTS: Record<string, string[]> = {
  견과류: ["견과", "땅콩", "호두", "아몬드"],
  갑각류: ["새우", "게", "꽃게", "갑각류"],
  유제품: ["우유", "치즈", "크림", "버터", "리코타"],
  계란: ["계란", "달걀", "에그"]
};

const initialMeals: Meal[] = [
  {
    id: "student-center",
    cafeteria: "학생회관 식당",
    location: "학생회관 2층",
    time: "중식",
    emoji: "🍲",
    menu: [
      { id: "beef", name: "소고기 된장찌개", kcal: 185, category: "한식", tags: ["국물", "단백질"], score: 4.7, votes: 328, confidence: "높음" },
      { id: "rice", name: "현미밥", kcal: 290, category: "밥", tags: ["든든한"], score: 4.2, votes: 205, confidence: "높음" },
      { id: "pork", name: "제육볶음", kcal: 335, category: "한식", tags: ["매콤한", "단백질"], score: 4.6, votes: 291, confidence: "보통" },
      { id: "greens", name: "시금치나물", kcal: 42, category: "반찬", tags: ["채소", "가벼운"], score: 4.1, votes: 168, confidence: "높음" }
    ]
  },
  {
    id: "dormitory",
    cafeteria: "기숙사 식당",
    location: "관악사 919동",
    time: "중식",
    emoji: "🍝",
    menu: [
      { id: "pasta", name: "치킨 토마토 파스타", kcal: 612, category: "양식", tags: ["단백질", "인기"], score: 4.8, votes: 417, confidence: "보통" },
      { id: "salad", name: "리코타 샐러드", kcal: 156, category: "샐러드", tags: ["채소", "가벼운"], score: 4.4, votes: 180, confidence: "높음" },
      { id: "garlic", name: "갈릭브레드", kcal: 146, category: "빵", tags: ["사이드"], score: 4.0, votes: 91, confidence: "보통" }
    ]
  },
  {
    id: "engineering",
    cafeteria: "공대간이식당",
    location: "302동 1층",
    time: "중식",
    emoji: "🍛",
    menu: [
      { id: "curry", name: "닭다리살 카레", kcal: 530, category: "일식", tags: ["든든한", "단백질"], score: 4.5, votes: 204, confidence: "보통" },
      { id: "egg", name: "반숙 계란", kcal: 75, category: "사이드", tags: ["단백질"], score: 4.3, votes: 112, confidence: "높음" },
      { id: "pickles", name: "오이피클", kcal: 14, category: "반찬", tags: ["가벼운"], score: 3.9, votes: 55, confidence: "높음" }
    ]
  }
];

const tabItems = [
  { id: "home", label: "홈", icon: "⌂" },
  { id: "upload", label: "식단 등록", icon: "＋" },
  { id: "records", label: "내 기록", icon: "◷" },
  { id: "profile", label: "내 설정", icon: "♙" }
];

function formatKcal(value: number | null) {
  return value === null ? "칼로리 확인 필요" : `${value.toLocaleString("ko-KR")} kcal`;
}

const SIKSHA_API = "https://siksha-server.wafflestudio.com";
const CALORIE_OVERRIDES_KEY = "mysnu-calorie-overrides-v1";

function readCalorieOverrides(): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem(CALORIE_OVERRIDES_KEY) || "{}"); }
  catch { return {}; }
}

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateLabel(date: string) {
  const day = new Date(`${date}T12:00:00+09:00`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(day);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(day);
  return `${value("month")}월 ${value("day")}일 ${weekday}`;
}

function mealTag(type: string): Meal["time"] {
  return type === "br" ? "조식" : type === "dn" ? "석식" : "중식";
}

function liveMealsFromSiksha(payload: any): Meal[] {
  const day = Array.isArray(payload?.result) ? payload.result[0] : null;
  if (!day) return [];
  const groups = ["br", "lu", "dn"];
  return groups.flatMap((group) => (day[group] || [])
    .filter((restaurant: any) => Array.isArray(restaurant.menus) && restaurant.menus.length)
    .map((restaurant: any) => ({
      id: `siksha-${group}-${restaurant.id}`,
      cafeteria: restaurant.name_kr || restaurant.nameKr || restaurant.code || "식샤 등록 식당",
      location: restaurant.addr || "식샤 연동 식당",
      time: mealTag(group),
      emoji: group === "br" ? "🥪" : group === "dn" ? "🍱" : "🍽️",
      menu: restaurant.menus.map((item: any) => ({
        id: `siksha-${item.id}`,
        name: String(item.name_kr || item.nameKr || item.code || "이름 없는 메뉴").replace(/<|>/g, ""),
        ...estimateCalories(item.name_kr || item.nameKr || item.code || ""),
        category: menuCategory(item.name_kr || item.nameKr || item.code || ""),
        tags: ["식샤"],
        score: Number(item.score) || 0,
        votes: Number(item.review_cnt) || 0,
        price: item.price == null ? undefined : Number(item.price)
      }))
    })));
}

export default function Home() {
  const [view, setView] = useState("home");
  const [meals, setMeals] = useState(initialMeals);
  const [cafeteria, setCafeteria] = useState("전체 식당");
  const [mealType, setMealType] = useState<Meal["time"]>("중식");
  const [recordsByDate, setRecordsByDate] = useState<Record<string, MealRecord[]>>({});
  const [votes, setVotes] = useState<Record<string, "like" | "dislike">>({});
  const [target, setTarget] = useState("유지");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState("");
  const [uploads, setUploads] = useState<SavedUpload[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [syncState, setSyncState] = useState<"loading" | "live" | "fallback">("loading");
  const [menuDate, setMenuDate] = useState(todayInSeoul());
  const [editingMenu, setEditingMenu] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  useEffect(() => {
    const saved = readLocalData();
    if (saved) {
      const overrides = readCalorieOverrides();
      const restoredUploads = saved.uploads.filter(meal => meal.date === todayInSeoul()).map(meal => ({
        ...meal,
        menu: meal.menu.map(menu => {
          const entered = overrides[`${meal.date}:${menu.id}`];
          return Number.isFinite(entered) && entered > 0 ? { ...menu, ...userCalories(entered) } : menu;
        })
      }));
      setRecordsByDate(saved.recordsByDate);
      setVotes(saved.votes);
      setTarget(saved.target);
      setPreferredCategories(saved.preferredCategories);
      setAllergies(saved.allergies);
      setDislikedIngredients(saved.dislikedIngredients);
      setUploads(saved.uploads);
      setMeals(previous => [...restoredUploads, ...previous]);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const data: LocalData = { version: 1, recordsByDate, votes, target, preferredCategories, allergies, dislikedIngredients, uploads };
    try { window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data)); }
    catch { setNotice("기기 저장 공간이 부족하거나 차단되어 기록을 저장하지 못했어요."); }
  }, [storageReady, recordsByDate, votes, target, preferredCategories, allergies, dislikedIngredients, uploads]);

  useEffect(() => {
    let active = true;
    const loadSiksha = async () => {
      const date = todayInSeoul();
      try {
        const response = await fetch(`${SIKSHA_API}/menus/web?start_date=${date}&end_date=${date}&except_empty=false`);
        if (!response.ok) throw new Error("식샤 서버 응답 오류");
        const overrides = readCalorieOverrides();
        const nextMeals = liveMealsFromSiksha(await response.json()).map(meal => ({
          ...meal,
          menu: meal.menu.map(menu => {
            const entered = overrides[`${date}:${menu.id}`];
            return Number.isFinite(entered) && entered > 0 ? { ...menu, ...userCalories(entered) } : menu;
          })
        }));
        if (!nextMeals.length) throw new Error("등록된 식단 없음");
        if (active) {
          setMeals(previous => [...previous.filter(meal => meal.id.startsWith("upload-") && (meal as SavedUpload).date === date), ...nextMeals]);
          setMenuDate(date);
          setSyncState("live");
        }
      } catch {
        if (active) setSyncState("fallback");
      }
    };
    loadSiksha();
    const refresh = window.setInterval(loadSiksha, 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(refresh); };
  }, []);

  const selectedRecords = recordsByDate[menuDate] || [];
  const selected = selectedRecords.map(item => item.id);
  const todayTotal = selectedRecords.reduce((sum, item) => sum + (item.kcal || 0), 0);
  const unknownSelected = selectedRecords.filter(item => item.kcal === null).length;
  const filteredMeals = (cafeteria === "전체 식당" ? meals : meals.filter((meal) => meal.cafeteria === cafeteria))
    .filter((meal) => meal.time === mealType);
  const progress = Math.min(100, Math.round((todayTotal / (target === "다이어트" ? 1550 : target === "벌크업" ? 2500 : 2000)) * 100));

  function toggleSelection(id: string) {
    const meal = meals.find(item => item.menu.some(menu => menu.id === id));
    const menu = meal?.menu.find(item => item.id === id);
    if (!meal || !menu) return;
    setRecordsByDate(previous => {
      const daily = previous[menuDate] || [];
      return { ...previous, [menuDate]: daily.some(item => item.id === id)
        ? daily.filter(item => item.id !== id)
        : [...daily, { id, name: menu.name, category: menu.category, cafeteria: meal.cafeteria, kcal: menu.kcal }] };
    });
  }

  function removeRecord(date: string, id: string) {
    setRecordsByDate(previous => ({ ...previous, [date]: (previous[date] || []).filter(item => item.id !== id) }));
    setNotice("선택 기록을 이 기기에서 삭제했어요.");
  }

  function saveCalories(menuId: string) {
    const kcal = Number(editValue);
    if (!Number.isFinite(kcal) || kcal < 1 || kcal > 5000) { setNotice("칼로리를 1~5000 사이의 숫자로 입력해 주세요."); return; }
    const overrides = readCalorieOverrides();
    overrides[`${menuDate}:${menuId}`] = Math.round(kcal);
    try { window.localStorage.setItem(CALORIE_OVERRIDES_KEY, JSON.stringify(overrides)); }
    catch { setNotice("기기 저장 공간이 부족하거나 차단되어 칼로리를 저장하지 못했어요."); return; }
    setMeals(previous => previous.map(meal => ({ ...meal, menu: meal.menu.map(menu => menu.id === menuId ? { ...menu, ...userCalories(Math.round(kcal)) } : menu) })));
    setRecordsByDate(previous => ({ ...previous, [menuDate]: (previous[menuDate] || []).map(item => item.id === menuId ? { ...item, kcal: Math.round(kcal) } : item) }));
    setEditingMenu(null);
    setNotice("입력한 칼로리를 이 기기에 저장했어요.");
  }

  function resetCalories(menuId: string) {
    const overrides = readCalorieOverrides();
    delete overrides[`${menuDate}:${menuId}`];
    try { window.localStorage.setItem(CALORIE_OVERRIDES_KEY, JSON.stringify(overrides)); }
    catch { setNotice("기기 저장 공간이 부족하거나 차단되어 변경을 저장하지 못했어요."); return; }
    setMeals(previous => previous.map(meal => ({ ...meal, menu: meal.menu.map(menu => menu.id === menuId ? { ...menu, ...estimateCalories(menu.name) } : menu) })));
    const menu = meals.flatMap(meal => meal.menu).find(item => item.id === menuId);
    if (menu) setRecordsByDate(previous => ({ ...previous, [menuDate]: (previous[menuDate] || []).map(item => item.id === menuId ? { ...item, kcal: estimateCalories(menu.name).kcal } : item) }));
    setEditingMenu(null);
  }

  function registerVote(menuId: string, nextVote: "like" | "dislike") {
    setVotes(previous => ({ ...previous, [menuId]: nextVote }));
    setNotice("평가를 이 기기에 저장하고 다음 추천에 반영할게요.");
  }

  function addUploadedMeal(name: string, rawText: string) {
    const cleaned = rawText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
    if (!cleaned.length) {
      setNotice("읽어올 메뉴를 한 줄 이상 입력해 주세요.");
      return;
    }
    const newMeal: SavedUpload = {
      id: `upload-${Date.now()}`,
      date: menuDate,
      cafeteria: name || "새 식당",
      location: "사용자 등록 식단",
      time: "중식",
      emoji: "📋",
      menu: cleaned.map((menuName, index) => ({
        id: `custom-${Date.now()}-${index}`,
        name: menuName,
        ...estimateCalories(menuName),
        category: menuCategory(menuName),
        tags: ["추정"],
        score: 0,
        votes: 0,
      }))
    };
    setMeals((previous) => [newMeal, ...previous]);
    setUploads(previous => [newMeal, ...previous].slice(0, 50));
    setCafeteria("전체 식당");
    setView("home");
    setNotice("식단을 이 기기에 저장했어요. 칼로리는 메뉴를 눌러 수정할 수 있어요.");
  }

  function clearLocalData() {
    if (!window.confirm("이 기기에 저장된 투표, 식사 기록, 설정, 등록 식단, 칼로리 수정값을 모두 삭제할까요? 복구할 수 없습니다.")) return;
    try {
      window.localStorage.removeItem(LOCAL_DATA_KEY);
      window.localStorage.removeItem(CALORIE_OVERRIDES_KEY);
    } catch { setNotice("브라우저 저장소에 접근하지 못해 데이터를 삭제할 수 없어요."); return; }
    setRecordsByDate({}); setVotes({}); setTarget("유지");
    setPreferredCategories([]); setAllergies([]); setDislikedIngredients(""); setUploads([]);
    setMeals(previous => previous.filter(meal => !meal.id.startsWith("upload-")).map(meal => ({ ...meal, menu: meal.menu.map(menu => ({ ...menu, ...estimateCalories(menu.name) })) })));
    setNotice("이 기기에 저장된 내 데이터를 삭제했어요.");
  }

  return (
    <main>
      <header className="topbar">
        <button className="logo" onClick={() => setView("home")} aria-label="홈으로 이동">
          <span className="logo-mark">M</span>
          <span>오늘 뭐먹지?</span>
        </button>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setNotice("알림이 없어요. 점심 메뉴가 업데이트되면 알려드릴게요.")} aria-label="알림">♧</button>
          <button className="login-shortcut" onClick={() => setView("profile")} aria-label="내 기기 저장 설정 열기">내 설정</button>
        </div>
      </header>

      <section className="app-shell">
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {view === "home" && <HomeView
          meals={filteredMeals}
          allMeals={meals}
          cafeteria={cafeteria}
          setCafeteria={setCafeteria}
          mealType={mealType}
          setMealType={setMealType}
          selected={selected}
          toggleSelection={toggleSelection}
          total={todayTotal}
          unknownSelected={unknownSelected}
          progress={progress}
          target={target}
          votes={votes}
          preferredCategories={preferredCategories}
          allergies={allergies}
          dislikedIngredients={dislikedIngredients}
          recordsByDate={recordsByDate}
          onVote={registerVote}
          setView={setView}
          syncState={syncState}
          menuDate={menuDate}
          editingMenu={editingMenu}
          editValue={editValue}
          setEditValue={setEditValue}
          onEdit={(menu) => { setEditingMenu(menu.id); setEditValue(menu.kcal === null ? "" : String(menu.kcal)); }}
          onCancelEdit={() => setEditingMenu(null)}
          onSaveCalories={saveCalories}
          onResetCalories={resetCalories}
        />}
        {view === "upload" && <UploadView onComplete={addUploadedMeal} />}
        {view === "records" && <RecordsView recordsByDate={recordsByDate} menuDate={menuDate} onRemove={removeRecord} />}
        {view === "profile" && <ProfileView target={target} setTarget={setTarget} preferredCategories={preferredCategories} setPreferredCategories={setPreferredCategories} allergies={allergies} setAllergies={setAllergies} dislikedIngredients={dislikedIngredients} setDislikedIngredients={setDislikedIngredients} onClearData={clearLocalData} onAdmin={() => setShowAdmin(true)} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      {showAdmin && <AdminSheet onClose={() => setShowAdmin(false)} />}
    </main>
  );
}

function HomeView({ meals, allMeals, cafeteria, setCafeteria, mealType, setMealType, selected, toggleSelection, total, unknownSelected, progress, target, votes, preferredCategories, allergies, dislikedIngredients, recordsByDate, onVote, setView, syncState, menuDate, editingMenu, editValue, setEditValue, onEdit, onCancelEdit, onSaveCalories, onResetCalories }: {
  meals: Meal[]; allMeals: Meal[]; cafeteria: string; setCafeteria: (value: string) => void; mealType: Meal["time"]; setMealType: (value: Meal["time"]) => void; selected: string[]; toggleSelection: (id: string) => void; total: number; unknownSelected: number; progress: number; target: string; votes: Record<string, "like" | "dislike">; preferredCategories: string[]; allergies: string[]; dislikedIngredients: string; recordsByDate: Record<string, MealRecord[]>; onVote: (id: string, value: "like" | "dislike") => void; setView: (view: string) => void; syncState: "loading" | "live" | "fallback"; menuDate: string; editingMenu: string | null; editValue: string; setEditValue: (value: string) => void; onEdit: (menu: Menu) => void; onCancelEdit: () => void; onSaveCalories: (id: string) => void; onResetCalories: (id: string) => void;
}) {
  const relevantMeals = allMeals.filter((meal) => meal.time === mealType);
  const avoidTerms = [...allergies.flatMap(item => ALLERGY_NAME_HINTS[item] || [item]), ...dislikedIngredients.split(/[,\n]/).map(item => item.trim()).filter(Boolean)];
  const history = Object.values(recordsByDate).flat();
  const candidateMeals = relevantMeals.length ? relevantMeals : allMeals;
  const candidates = candidateMeals.flatMap(meal => meal.menu).filter(menu => menu.kcal !== null && votes[menu.id] !== "dislike" && !avoidTerms.some(term => menu.name.includes(term)));
  const mealTarget = target === "다이어트" ? 500 : target === "벌크업" ? 900 : 700;
  const recommendation = candidates.sort((first, second) => {
    const rank = (menu: Menu) => menu.score * 8 + Math.log1p(menu.votes) * 3
      + (preferredCategories.includes(menu.category) ? 22 : 0)
      + (votes[menu.id] === "like" ? 26 : votes[menu.id] === "dislike" ? -35 : 0)
      + Math.min(3, history.filter(item => item.name === menu.name).length) * 8
      + Math.max(0, 18 - Math.abs((menu.kcal || 0) - mealTarget) / 30);
    return rank(second) - rank(first);
  })[0];
  const recommendationRestaurant = allMeals.find((meal) => meal.menu.some((menu) => menu.id === recommendation?.id));
  const hasPersonalData = history.length > 0 || Object.keys(votes).length > 0 || preferredCategories.length > 0;
  const reason = recommendation ? [
    preferredCategories.includes(recommendation.category) ? `선호하는 ${recommendation.category} 메뉴` : "",
    votes[recommendation.id] === "like" ? "좋게 평가한 메뉴" : "",
    history.some(item => item.name === recommendation.name) ? "이전에 선택한 메뉴" : "",
    recommendation.score >= 4 ? "식샤 평점이 높은 메뉴" : "",
    `${target} 목표 칼로리 고려`
  ].filter(Boolean).slice(0, 2).join(" · ") : "";
  return <>
    <section className="hero">
      <p className="eyebrow">{dateLabel(menuDate)} · {mealType}</p>
      <h1>오늘, <em>무엇을 먹을까요?</em></h1>
      <p className="hero-copy">내 취향과 오늘의 칼로리 목표를 반영한<br />학식 추천을 확인해 보세요.</p>
      <div className="date-switcher"><button aria-label="어제">‹</button><strong>오늘</strong><button aria-label="내일">›</button></div>
    </section>

    <section className="recommend-card">
      <div className="recommend-top"><span className="sparkle">✦</span><span>오늘의 맞춤 추천</span><span className="match">{hasPersonalData ? "내 기록 반영" : "인기 기반"}</span></div>
      {recommendation ? <><div className="recommend-content">
        <div><p className="restaurant">{recommendationRestaurant?.cafeteria || "식샤 연동 식당"}</p><h2>{recommendation.name}</h2><p className="why">{reason}</p></div>
        <div className="food-emoji">🍝</div>
      </div>
      <div className="recommend-footer"><span>{recommendation.score ? <>★ {recommendation.score.toFixed(1)} <small>({recommendation.votes}명)</small></> : "신규 메뉴"}</span><span>{formatKcal(recommendation.kcal)} · {recommendation.confidence === "직접 입력" ? "직접 입력" : "추정치"}</span></div>
      <div className="vote-row"><span>이 추천, 마음에 드나요?</span><button className={votes[recommendation.id] === "like" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "like")}>👍 맛있어 보여요</button><button className={votes[recommendation.id] === "dislike" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "dislike")}>👎 별로예요</button></div></> : <p className="recommend-empty">조건에 맞는 칼로리 확인 메뉴가 없어요. 식단이나 제외 식재료를 확인해 주세요.</p>}
    </section>

    <section className="calorie-card">
      <div><p>오늘 선택한 메뉴</p><strong>{formatKcal(total)}</strong><span> / {target === "다이어트" ? "1,550" : target === "벌크업" ? "2,500" : "2,000"} kcal</span></div>
      <div className="ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></div>
      <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      <p className="calorie-caption">선택한 메뉴를 눌러 합계에 추가하거나 뺄 수 있어요.{unknownSelected > 0 && ` 칼로리 미확인 ${unknownSelected}개는 합계에서 제외됐어요.`}</p>
    </section>

    <section className="meal-heading"><div><p className="eyebrow">오늘의 식단</p><h2>어디서 먹을까요?</h2></div><button onClick={() => setView("upload")}>식단 등록 <span>＋</span></button></section>
    <div className={`sync-status ${syncState}`}><span>{syncState === "live" ? "●" : syncState === "loading" ? "◌" : "!"}</span>{syncState === "live" ? `식샤 실시간 연동 · ${allMeals.length}개 식당 메뉴` : syncState === "loading" ? "식샤 식단을 불러오는 중" : "식샤 연결이 지연되어 예시 식단을 표시 중"}<small>{syncState === "live" ? "10분마다 갱신" : ""}</small></div>
    <div className="filter-row">
      {['전체 식당', ...allMeals.map((meal) => meal.cafeteria)].filter((item, index, items) => items.indexOf(item) === index).map((item) => <button className={cafeteria === item ? "chosen" : ""} key={item} onClick={() => setCafeteria(item)}>{item}</button>)}
    </div>
    <div className="time-tabs three"><button className={mealType === "조식" ? "active" : ""} onClick={() => setMealType("조식")}>조식</button><button className={mealType === "중식" ? "active" : ""} onClick={() => setMealType("중식")}>중식</button><button className={mealType === "석식" ? "active" : ""} onClick={() => setMealType("석식")}>석식</button></div>
    <div className="meal-list">
      {meals.map((meal) => <article className="meal-card" key={meal.id}>
        <div className="meal-title"><div className="meal-icon">{meal.emoji}</div><div><h3>{meal.cafeteria}</h3><p>{meal.location} · {meal.time}</p></div><button className="more" aria-label={`${meal.cafeteria} 상세 보기`}>···</button></div>
        <div className="menu-list">{meal.menu.map((menu) => <div className="menu-entry" key={menu.id}>
          <div className="menu-entry-top"><button className={`menu-item ${selected.includes(menu.id) ? "checked" : ""}`} onClick={() => toggleSelection(menu.id)}>
            <span className="check">{selected.includes(menu.id) ? "✓" : ""}</span><span className="menu-name">{menu.name}<small>{menu.tags.map(tag => <i key={tag}>{tag}</i>)}</small></span><span className="menu-meta"><b>{formatKcal(menu.kcal)}</b><small>{menu.price ? `${menu.price.toLocaleString("ko-KR")}원 · ` : ""}{menu.confidence === "직접 입력" ? "직접 입력" : `${menu.confidence} 신뢰도`}</small></span>
          </button><button className="calorie-edit-button" onClick={() => onEdit(menu)} aria-label={`${menu.name} 칼로리 수정`}>수정</button></div>
          <p className="calorie-basis">{menu.low != null && menu.high != null && menu.confidence !== "직접 입력" ? `예상 ${menu.low.toLocaleString("ko-KR")}~${menu.high.toLocaleString("ko-KR")} kcal · ` : ""}{menu.basis || "예시 식단의 칼로리 추정치"}{menu.sourceUrl && <> · <a href={menu.sourceUrl} target="_blank" rel="noopener noreferrer">참고 자료</a></>}</p>
          {editingMenu === menu.id && <div className="calorie-editor"><label>확인한 칼로리 (kcal)<input type="number" min="1" max="5000" inputMode="numeric" value={editValue} onChange={event => setEditValue(event.target.value)} /></label><button onClick={() => onSaveCalories(menu.id)}>저장</button><button onClick={() => onResetCalories(menu.id)}>추정치로 되돌리기</button><button onClick={onCancelEdit}>취소</button></div>}
        </div>)}</div>
        <div className="meal-bottom"><span>{meal.menu[0].score ? <>★ {meal.menu[0].score.toFixed(1)} <small>{meal.menu[0].votes}명 평가</small></> : "식샤 등록 메뉴"}</span><button>상세 보기 ›</button></div>
      </article>)}
      {!meals.length && <div className="empty"><span>🍽️</span><h3>등록된 식단이 없어요</h3><p>직접 입력하거나 이미지로 식단을 등록해 보세요.</p></div>}
    </div>
  </>;
}

function UploadView({ onComplete }: { onComplete: (name: string, menu: string) => void }) {
  const [mode, setMode] = useState<"text" | "image">("text");
  const [name, setName] = useState("학생회관 식당");
  const [text, setText] = useState("비빔밥\n미소된장국\n닭강정\n깍두기");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(false);
  function onFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) { setFileName(file.name); setParsed(false); } }
  return <section className="form-page"><p className="eyebrow">식단 데이터 등록</p><h1>오늘의 식단을<br /><em>함께 채워 주세요.</em></h1><p className="subcopy">마이스누 식단을 붙여넣어 저장하거나 이미지 등록 흐름을 데모로 체험해 보세요.</p>
    <div className="segmented"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>텍스트 붙여넣기</button><button className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}>이미지 OCR 데모</button></div>
    <label className="field"><span>식당 이름</span><input value={name} onChange={e => setName(e.target.value)} placeholder="예: 학생회관 식당" /></label>
    {mode === "text" ? <label className="field"><span>식단 메뉴 <small>줄바꿈 또는 쉼표로 구분</small></span><textarea value={text} onChange={e => setText(e.target.value)} rows={7} /></label> : <div className="upload-zone"><input id="menu-image" type="file" accept="image/*" onChange={onFile} /><label htmlFor="menu-image"><strong>▧</strong><b>{fileName || "식단 이미지 선택"}</b><span>이미지 분석은 아직 연결되지 않았어요. 데모 메뉴로 저장 흐름을 체험할 수 있습니다.</span></label>{fileName && <button className="scan" onClick={() => { setParsed(true); setText("김치볶음밥\n계란후라이\n유부장국\n단무지"); }}>데모 메뉴 불러오기</button>}{parsed && <div className="ocr-result">✓ 데모 메뉴를 불러왔어요. 실제 이미지에서 읽은 결과가 아니므로 수정해 주세요.</div>}</div>}
    {mode === "image" && parsed && <label className="field"><span>OCR 추출 결과 <small>수정 가능</small></span><textarea value={text} onChange={e => setText(e.target.value)} rows={5} /></label>}
    <div className="privacy-note">🔒 등록한 식단과 수정한 메뉴 텍스트는 이 기기에만 저장됩니다. 이미지는 저장·전송되지 않으며 OCR은 현재 데모입니다.</div>
    <button className="primary-button" disabled={mode === "image" && !parsed} onClick={() => onComplete(name, text)}>식단 등록하고 칼로리 계산하기 <span>→</span></button>
  </section>;
}

function RecordsView({ recordsByDate, menuDate, onRemove }: { recordsByDate: Record<string, MealRecord[]>; menuDate: string; onRemove: (date: string, id: string) => void }) {
  const dates = Object.keys(recordsByDate).filter(date => recordsByDate[date]?.length).sort((a, b) => b.localeCompare(a));
  const today = recordsByDate[menuDate] || [];
  const todayTotal = today.reduce((sum, item) => sum + (item.kcal || 0), 0);
  return <section className="form-page records"><p className="eyebrow">나의 식사 기록</p><h1>기기에 남긴 <em>식사 기록</em></h1><p className="subcopy">메뉴를 선택하면 날짜별로 이 브라우저에 저장돼요. 선택은 실제 섭취를 확인한 기록이 아니에요.</p>
    <div className="record-summary"><p>오늘 선택한 메뉴 <b>{today.length}개</b></p><strong>{formatKcal(todayTotal)}</strong></div>
    {dates.length ? dates.map(date => <section className="record-day" key={date}><h2>{date === menuDate ? "오늘" : dateLabel(date)} <small>{recordsByDate[date].length}개 · {formatKcal(recordsByDate[date].reduce((sum, item) => sum + (item.kcal || 0), 0))}</small></h2><div className="record-list">{recordsByDate[date].map(item => <div key={item.id}><span className="mini-check">✓</span><p>{item.name}<small>{item.cafeteria} · {item.category}</small></p><b>{formatKcal(item.kcal)}</b><button className="record-remove" onClick={() => onRemove(date, item.id)} aria-label={`${item.name} 선택 기록 삭제`}>삭제</button></div>)}</div></section>) : <div className="empty"><span>◷</span><h3>저장된 기록이 없어요</h3><p>오늘의 식단에서 메뉴를 선택해 보세요.</p></div>}
  </section>;
}

function ProfileView({ target, setTarget, preferredCategories, setPreferredCategories, allergies, setAllergies, dislikedIngredients, setDislikedIngredients, onClearData, onAdmin }: {
  target: string; setTarget: (value: string) => void; preferredCategories: string[]; setPreferredCategories: (value: string[]) => void; allergies: string[]; setAllergies: (value: string[]) => void; dislikedIngredients: string; setDislikedIngredients: (value: string) => void; onClearData: () => void; onAdmin: () => void;
}) {
  const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];
  return <section className="form-page profile"><p className="eyebrow">내 식단 설정</p><h1>취향을 알수록<br /><em>추천은 더 정확해져요.</em></h1>
    <section className="local-card"><strong>이 기기에만 저장돼요</strong><p>로그인 없이 이 브라우저에 투표, 선택 기록, 설정, 직접 등록한 식단을 저장합니다. 다른 기기와 동기화되지 않으며 브라우저 데이터를 지우면 기록도 사라집니다.</p></section>
    <label className="field"><span>칼로리 목표</span><select value={target} onChange={e => setTarget(e.target.value)}><option>다이어트</option><option>유지</option><option>벌크업</option></select></label>
    <div className="preference"><span>선호 식단</span><div>{CATEGORY_OPTIONS.map(item => <button key={item} className={preferredCategories.includes(item) ? "chosen" : ""} aria-pressed={preferredCategories.includes(item)} onClick={() => setPreferredCategories(toggle(preferredCategories, item))}>{item}</button>)}</div></div>
    <div className="preference"><span>알레르기 또는 제외할 재료</span><div>{ALLERGY_OPTIONS.map(item => <button key={item} className={allergies.includes(item) ? "chosen" : ""} aria-pressed={allergies.includes(item)} onClick={() => setAllergies(toggle(allergies, item))}>{item}</button>)}</div><p className="preference-help">메뉴 이름에 표시된 재료만 추천에서 제외할 수 있습니다. 실제 알레르기 안전 여부는 식당에 꼭 확인해 주세요.</p></div>
    <label className="field"><span>그 밖에 피하고 싶은 재료 <small>쉼표로 구분</small></span><input value={dislikedIngredients} onChange={e => setDislikedIngredients(e.target.value)} placeholder="예: 버섯, 오이" /></label>
    <section className="privacy-card"><strong>내 기기 데이터</strong><p>저장된 투표, 선택 기록, 설정, 직접 등록한 식단, 칼로리 수정값을 한 번에 삭제할 수 있습니다. 삭제 후 복구할 수 없어요.</p><button onClick={onClearData}>내 데이터 모두 삭제</button></section><button className="admin-link" onClick={onAdmin}>관리자 식단 검수 화면 열기 →</button>
  </section>;
}

function AdminSheet({ onClose }: { onClose: () => void }) { return <div className="modal-backdrop"><section className="admin-sheet"><button className="close" onClick={onClose}>×</button><p className="eyebrow">관리자 · 검수 대기</p><h2>새 식단 3건</h2><div className="pending"><div><span>학생회관 식당</span><b>메뉴 OCR 신뢰도 78%</b></div><p>김치볶음밥 · 계란후라이 · 유부장국</p><button>검수 시작</button></div><div className="pending"><div><span>기숙사 식당</span><b>칼로리 미입력 2개</b></div><p>닭갈비 · 현미밥 · 콘샐러드</p><button>검수 시작</button></div></section></div>; }
