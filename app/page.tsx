"use client";

import { useEffect, useState } from "react";
import { estimateCalories, userCalories } from "../lib/calories";
import { cleanOcrText, shiftDate } from "../lib/meal-utils";

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
type MealRecord = { id: string; name: string; category: string; cafeteria: string; kcal: number | null; confirmed?: boolean };
type LocalData = {
  version: 1;
  recordsByDate: Record<string, MealRecord[]>;
  votes: Record<string, "like" | "dislike">;
  target: string;
  targetKcal: number;
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
      target: ["다이어트", "유지", "벌크업", "직접 설정"].includes(data.target) ? data.target : "유지",
      targetKcal: Number.isFinite(data.targetKcal) && data.targetKcal >= 500 && data.targetKcal <= 5000
        ? Math.round(data.targetKcal)
        : data.target === "다이어트" ? 1550 : data.target === "벌크업" ? 2500 : 2000,
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

function relativeDateLabel(date: string) {
  const today = todayInSeoul();
  return date === today ? "오늘" : date === shiftDate(today, -1) ? "어제" : date === shiftDate(today, 1) ? "내일" : dateLabel(date);
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
  const [meals, setMeals] = useState<Meal[]>([]);
  const [cafeteria, setCafeteria] = useState("전체 식당");
  const [mealType, setMealType] = useState<Meal["time"]>("중식");
  const [recordsByDate, setRecordsByDate] = useState<Record<string, MealRecord[]>>({});
  const [votes, setVotes] = useState<Record<string, "like" | "dislike">>({});
  const [target, setTarget] = useState("유지");
  const [targetKcal, setTargetKcal] = useState(2000);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState("");
  const [uploads, setUploads] = useState<SavedUpload[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState<"loading" | "live" | "fallback" | "empty" | "error">("loading");
  const [menuDate, setMenuDate] = useState(todayInSeoul());
  const [editingMenu, setEditingMenu] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  useEffect(() => {
    const saved = readLocalData();
    if (saved) {
      const overrides = readCalorieOverrides();
      const restoredUploads = saved.uploads.filter(meal => meal.date === todayInSeoul()).map(meal => ({ ...meal,
        menu: meal.menu.map(menu => {
          const entered = overrides[`${meal.date}:${menu.id}`];
          return Number.isFinite(entered) && entered > 0 ? { ...menu, ...userCalories(entered) } : menu;
        }) }));
      setRecordsByDate(saved.recordsByDate);
      setVotes(saved.votes);
      setTarget(saved.target);
      setTargetKcal(saved.targetKcal);
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
    const data: LocalData = { version: 1, recordsByDate, votes, target, targetKcal, preferredCategories, allergies, dislikedIngredients, uploads };
    try { window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data)); }
    catch { setNotice("기기 저장 공간이 부족하거나 차단되어 기록을 저장하지 못했어요."); }
  }, [storageReady, recordsByDate, votes, target, targetKcal, preferredCategories, allergies, dislikedIngredients, uploads]);

  useEffect(() => {
    let active = true;
    const loadSiksha = async () => {
      const date = menuDate;
      setSyncState("loading");
      setMeals(uploads.filter(meal => meal.date === date).map(meal => ({ ...meal,
        menu: meal.menu.map(menu => {
          const entered = readCalorieOverrides()[`${date}:${menu.id}`];
          return Number.isFinite(entered) && entered > 0 ? { ...menu, ...userCalories(entered) } : menu;
        }) })));
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
        if (active) {
          setMeals([...uploads.filter(meal => meal.date === date).map(meal => ({ ...meal,
            menu: meal.menu.map(menu => {
              const entered = overrides[`${date}:${menu.id}`];
              return Number.isFinite(entered) && entered > 0 ? { ...menu, ...userCalories(entered) } : menu;
            }) })), ...nextMeals]);
          setSyncState(nextMeals.length ? "live" : "empty");
        }
      } catch {
        if (active) {
          if (date === todayInSeoul()) {
            setMeals([...uploads.filter(meal => meal.date === date), ...initialMeals.map(meal => ({ ...meal, menu: meal.menu.map(menu => ({ ...menu, score: 0, votes: 0, tags: ["예시"] })) }))]);
            setSyncState("fallback");
          } else setSyncState("error");
        }
      }
    };
    loadSiksha();
    const refresh = window.setInterval(loadSiksha, 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(refresh); };
  }, [menuDate, uploads]);

  const selectedRecords = (recordsByDate[menuDate] || []).filter(item => item.confirmed === true);
  const selected = selectedRecords.map(item => item.id);
  const todayTotal = selectedRecords.reduce((sum, item) => sum + (item.kcal || 0), 0);
  const unknownSelected = selectedRecords.filter(item => item.kcal === null).length;
  const filteredMeals = (cafeteria === "전체 식당" ? meals : meals.filter((meal) => meal.cafeteria === cafeteria))
    .filter((meal) => meal.time === mealType);
  const progress = Math.min(100, Math.round((todayTotal / targetKcal) * 100));

  function changeDate(date: string) {
    setMenuDate(date);
    setCafeteria("전체 식당");
    setEditingMenu(null);
  }

  function toggleSelection(id: string) {
    const meal = meals.find(item => item.menu.some(menu => menu.id === id));
    const menu = meal?.menu.find(item => item.id === id);
    if (!meal || !menu) return;
    setRecordsByDate(previous => {
      const daily = previous[menuDate] || [];
      return { ...previous, [menuDate]: daily.some(item => item.id === id && item.confirmed === true)
        ? daily.filter(item => item.id !== id)
        : [...daily.filter(item => item.id !== id), { id, name: menu.name, category: menu.category, cafeteria: meal.cafeteria, kcal: menu.kcal, confirmed: true }] };
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
    const menu = meals.flatMap(meal => meal.menu).find(item => item.id === menuId);
    if (!menu) return;
    const key = `name:${menu.name.trim().toLowerCase()}`;
    setVotes(previous => {
      const next = { ...previous };
      const current = next[key] || next[menuId];
      delete next[menuId];
      if (current === nextVote) delete next[key];
      else next[key] = nextVote;
      return next;
    });
    setNotice("관심 표시를 이 기기에 저장하고 같은 이름의 메뉴 추천에 반영해요.");
  }

  function addUploadedMeal(name: string, rawText: string, date: string, time: Meal["time"]) {
    const cleaned = rawText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
    if (!cleaned.length) {
      setNotice("읽어올 메뉴를 한 줄 이상 입력해 주세요.");
      return;
    }
    const stamp = Date.now();
    const newMeal: SavedUpload = {
      id: `upload-${stamp}`,
      date,
      cafeteria: name.trim() || "직접 등록한 식당",
      location: "사용자 등록 식단",
      time,
      emoji: "📋",
      menu: cleaned.map((menuName, index) => ({
        id: `custom-${stamp}-${index}`,
        name: menuName,
        ...estimateCalories(menuName),
        category: menuCategory(menuName),
        tags: ["추정"],
        score: 0,
        votes: 0,
      }))
    };
    setUploads(previous => [newMeal, ...previous].slice(0, 50));
    setMenuDate(date);
    setMealType(time);
    setCafeteria("전체 식당");
    setView("home");
    setNotice("식단을 이 기기에 저장했어요. 메뉴 옆 '수정'에서 칼로리를 바꿀 수 있어요.");
  }

  function removeUpload(id: string) {
    if (!window.confirm("직접 등록한 식단을 삭제할까요? 이 식단의 먹은 기록도 함께 삭제됩니다.")) return;
    setUploads(previous => previous.filter(meal => meal.id !== id));
    setRecordsByDate(previous => ({ ...previous, [menuDate]: (previous[menuDate] || []).filter(item => !item.id.startsWith(`custom-${id.slice(7)}-`)) }));
    const overrides = readCalorieOverrides();
    Object.keys(overrides).filter(key => key.startsWith(`${menuDate}:custom-${id.slice(7)}-`)).forEach(key => delete overrides[key]);
    try { window.localStorage.setItem(CALORIE_OVERRIDES_KEY, JSON.stringify(overrides)); } catch { setNotice("식단은 삭제했지만 일부 칼로리 수정값을 정리하지 못했어요."); return; }
    setNotice("직접 등록한 식단을 삭제했어요.");
  }

  function updateTarget(value: string) {
    setTarget(value);
    if (value !== "직접 설정") setTargetKcal(value === "다이어트" ? 1550 : value === "벌크업" ? 2500 : 2000);
  }

  function clearLocalData() {
    if (!window.confirm("이 기기에 저장된 투표, 식사 기록, 설정, 등록 식단, 칼로리 수정값을 모두 삭제할까요? 복구할 수 없습니다.")) return;
    try {
      window.localStorage.removeItem(LOCAL_DATA_KEY);
      window.localStorage.removeItem(CALORIE_OVERRIDES_KEY);
    } catch { setNotice("브라우저 저장소에 접근하지 못해 데이터를 삭제할 수 없어요."); return; }
    setRecordsByDate({}); setVotes({}); setTarget("유지"); setTargetKcal(2000);
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
          targetKcal={targetKcal}
          votes={votes}
          preferredCategories={preferredCategories}
          allergies={allergies}
          dislikedIngredients={dislikedIngredients}
          recordsByDate={recordsByDate}
          onVote={registerVote}
          setView={setView}
          syncState={syncState}
          menuDate={menuDate}
          setMenuDate={changeDate}
          onRemoveUpload={removeUpload}
          editingMenu={editingMenu}
          editValue={editValue}
          setEditValue={setEditValue}
          onEdit={(menu) => { setEditingMenu(menu.id); setEditValue(menu.kcal === null ? "" : String(menu.kcal)); }}
          onCancelEdit={() => setEditingMenu(null)}
          onSaveCalories={saveCalories}
          onResetCalories={resetCalories}
        />}
        {view === "upload" && <UploadView defaultDate={menuDate} defaultTime={mealType} onComplete={addUploadedMeal} />}
        {view === "records" && <RecordsView recordsByDate={recordsByDate} onRemove={removeRecord} />}
        {view === "profile" && <ProfileView target={target} setTarget={updateTarget} targetKcal={targetKcal} setTargetKcal={setTargetKcal} preferredCategories={preferredCategories} setPreferredCategories={setPreferredCategories} allergies={allergies} setAllergies={setAllergies} dislikedIngredients={dislikedIngredients} setDislikedIngredients={setDislikedIngredients} onClearData={clearLocalData} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
    </main>
  );
}

function HomeView({ meals, allMeals, cafeteria, setCafeteria, mealType, setMealType, selected, toggleSelection, total, unknownSelected, progress, targetKcal, votes, preferredCategories, allergies, dislikedIngredients, recordsByDate, onVote, setView, syncState, menuDate, setMenuDate, onRemoveUpload, editingMenu, editValue, setEditValue, onEdit, onCancelEdit, onSaveCalories, onResetCalories }: {
  meals: Meal[]; allMeals: Meal[]; cafeteria: string; setCafeteria: (value: string) => void; mealType: Meal["time"]; setMealType: (value: Meal["time"]) => void; selected: string[]; toggleSelection: (id: string) => void; total: number; unknownSelected: number; progress: number; targetKcal: number; votes: Record<string, "like" | "dislike">; preferredCategories: string[]; allergies: string[]; dislikedIngredients: string; recordsByDate: Record<string, MealRecord[]>; onVote: (id: string, value: "like" | "dislike") => void; setView: (view: string) => void; syncState: "loading" | "live" | "fallback" | "empty" | "error"; menuDate: string; setMenuDate: (date: string) => void; onRemoveUpload: (id: string) => void; editingMenu: string | null; editValue: string; setEditValue: (value: string) => void; onEdit: (menu: Menu) => void; onCancelEdit: () => void; onSaveCalories: (id: string) => void; onResetCalories: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleMeals = query.trim() ? meals.map(meal => ({ ...meal, menu: meal.menu.filter(menu => menu.name.toLowerCase().includes(query.trim().toLowerCase()) || meal.cafeteria.toLowerCase().includes(query.trim().toLowerCase())) })).filter(meal => meal.menu.length) : meals;
  const relevantMeals = allMeals.filter((meal) => meal.time === mealType);
  const avoidTerms = [...allergies.flatMap(item => ALLERGY_NAME_HINTS[item] || [item]), ...dislikedIngredients.split(/[,\n]/).map(item => item.trim()).filter(Boolean)];
  const history = Object.values(recordsByDate).flat();
  const voteFor = (menu: Menu) => votes[`name:${menu.name.trim().toLowerCase()}`] || votes[menu.id];
  const candidates = relevantMeals.flatMap(meal => meal.menu).filter(menu => menu.kcal !== null && voteFor(menu) !== "dislike" && !avoidTerms.some(term => menu.name.includes(term)));
  const mealTarget = Math.round(targetKcal / 3);
  const recommendation = candidates.sort((first, second) => {
    const rank = (menu: Menu) => menu.score * 8 + Math.log1p(menu.votes) * 3
      + (preferredCategories.includes(menu.category) ? 22 : 0)
      + (voteFor(menu) === "like" ? 26 : voteFor(menu) === "dislike" ? -35 : 0)
      + Math.min(3, history.filter(item => item.name === menu.name).length) * 8
      + Math.max(0, 18 - Math.abs((menu.kcal || 0) - mealTarget) / 30);
    return rank(second) - rank(first);
  })[0];
  const recommendationRestaurant = allMeals.find((meal) => meal.menu.some((menu) => menu.id === recommendation?.id));
  const hasPersonalData = history.length > 0 || Object.keys(votes).length > 0 || preferredCategories.length > 0;
  const reason = recommendation ? [
    preferredCategories.includes(recommendation.category) ? `선호하는 ${recommendation.category} 메뉴` : "",
    voteFor(recommendation) === "like" ? "관심 표시한 메뉴" : "",
    history.some(item => item.name === recommendation.name) ? "이전에 선택한 메뉴" : "",
    recommendation.score >= 4 ? "식샤 평점이 높은 메뉴" : "",
    `하루 ${targetKcal.toLocaleString("ko-KR")} kcal 목표 고려`
  ].filter(Boolean).slice(0, 2).join(" · ") : "";
  const isFuture = menuDate > todayInSeoul();
  return <>
    <section className="hero">
      <p className="eyebrow">{dateLabel(menuDate)} · {mealType}</p>
      <h1>{relativeDateLabel(menuDate)}, <em>무엇을 먹을까요?</em></h1>
      <p className="hero-copy">날짜를 바꾸면 해당 날짜에 등록된 식샤 식단을 불러와요.</p>
      <div className="date-switcher"><button onClick={() => setMenuDate(shiftDate(menuDate, -1))} aria-label="전날 식단">‹</button><strong>{relativeDateLabel(menuDate)}</strong><button onClick={() => setMenuDate(shiftDate(menuDate, 1))} aria-label="다음 날 식단">›</button></div>
      <label className="date-input">날짜 직접 선택 <input type="date" value={menuDate} onChange={event => { if (event.target.value) setMenuDate(event.target.value); }} /></label>
      {menuDate !== todayInSeoul() && <button className="today-shortcut" onClick={() => setMenuDate(todayInSeoul())}>오늘로 돌아가기</button>}
    </section>

    <section className="recommend-card">
      <div className="recommend-top"><span className="sparkle">✦</span><span>{relativeDateLabel(menuDate)}의 추천</span><span className="match">{hasPersonalData ? "내 기록 반영" : "식샤 인기 기반"}</span></div>
      {recommendation ? <><div className="recommend-content">
        <div><p className="restaurant">{recommendationRestaurant?.cafeteria || "식샤 연동 식당"}</p><h2>{recommendation.name}</h2><p className="why">{reason}</p></div>
        <div className="food-emoji">{recommendationRestaurant?.emoji || "🍽️"}</div>
      </div>
      <div className="recommend-footer"><span>{recommendation.score ? <>★ {recommendation.score.toFixed(1)} <small>({recommendation.votes}명)</small></> : "신규 메뉴"}</span><span>{formatKcal(recommendation.kcal)} · {recommendation.confidence === "직접 입력" ? "직접 입력" : "추정치"}</span></div>
      <div className="vote-row"><span>추천 취향에 반영</span><button aria-pressed={voteFor(recommendation) === "like"} className={voteFor(recommendation) === "like" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "like")}>👍 관심 있어요</button><button aria-pressed={voteFor(recommendation) === "dislike"} className={voteFor(recommendation) === "dislike" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "dislike")}>👎 관심 없어요</button></div></> : <p className="recommend-empty">{syncState === "loading" ? "식단을 불러오고 있어요." : "이 끼니에 추천할 메뉴가 없어요. 다른 끼니를 보거나 제외 재료를 확인해 주세요."}</p>}
    </section>

    <section className="calorie-card">
      <div><p>{relativeDateLabel(menuDate)} 먹은 메뉴 기록</p><strong>{formatKcal(total)}</strong><span> / 하루 목표 {targetKcal.toLocaleString("ko-KR")} kcal</span></div>
      <div className="ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></div>
      <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      <p className="calorie-caption">{isFuture ? "미래 날짜는 식사 기록을 남길 수 없어요." : "아래 메뉴의 '먹었어요'를 누르면 이 날짜의 섭취 기록과 합계에 반영돼요. 식사 전체를 기록해야 하루 합계가 정확해집니다."}{unknownSelected > 0 && ` 칼로리 미확인 ${unknownSelected}개는 합계에서 제외됐어요.`}</p>
    </section>

    <section className="meal-heading"><div><p className="eyebrow">{dateLabel(menuDate)} 식단</p><h2>어디서 먹을까요?</h2></div><button onClick={() => setView("upload")}>빠진 식단 직접 등록 <span>＋</span></button></section>
    <div className={`sync-status ${syncState}`}><span>{syncState === "live" ? "●" : syncState === "loading" ? "◌" : "!"}</span>{syncState === "live" ? `식샤 연동 · ${new Set(allMeals.filter(meal => !meal.id.startsWith("upload-")).map(meal => meal.cafeteria)).size}개 식당` : syncState === "loading" ? "식샤 식단을 불러오는 중" : syncState === "fallback" ? "식샤 연결 실패 · 오늘의 예시 식단 표시 중" : syncState === "empty" ? "식샤에 이 날짜의 등록 메뉴가 없어요" : "식샤 연결 실패 · 이 날짜의 식단을 불러오지 못했어요"}<small>{syncState === "live" ? "10분마다 갱신" : ""}</small></div>
    <div className="filter-row">
      {['전체 식당', ...allMeals.map((meal) => meal.cafeteria)].filter((item, index, items) => items.indexOf(item) === index).map((item) => <button className={cafeteria === item ? "chosen" : ""} key={item} onClick={() => setCafeteria(item)}>{item}</button>)}
    </div>
    <div className="time-tabs three"><button className={mealType === "조식" ? "active" : ""} onClick={() => setMealType("조식")}>조식</button><button className={mealType === "중식" ? "active" : ""} onClick={() => setMealType("중식")}>중식</button><button className={mealType === "석식" ? "active" : ""} onClick={() => setMealType("석식")}>석식</button></div>
    <label className="menu-search">식당·메뉴 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 제육볶음, 학생회관" /></label>
    <div className="meal-list">
      {visibleMeals.map((meal) => <article className="meal-card" key={meal.id}>
        <div className="meal-title"><div className="meal-icon">{meal.emoji}</div><div><h3>{meal.cafeteria}</h3><p>{meal.location} · {meal.time}</p></div>{meal.id.startsWith("upload-") && <button className="record-remove" onClick={() => onRemoveUpload(meal.id)} aria-label={`${meal.cafeteria} 직접 등록 식단 삭제`}>삭제</button>}</div>
        <div className="menu-list">{meal.menu.map((menu) => <div className="menu-entry" key={menu.id}>
          <div className="menu-entry-top"><div className="menu-item"><span className="menu-name">{menu.name}<small>{menu.tags.map(tag => <i key={tag}>{tag}</i>)}</small></span><span className="menu-meta"><b>{formatKcal(menu.kcal)}</b><small>{menu.price ? `${menu.price.toLocaleString("ko-KR")}원 · ` : ""}{menu.confidence === "직접 입력" ? "직접 입력" : `${menu.confidence} 신뢰도`}</small>{menu.votes > 0 && <small>★ {menu.score.toFixed(1)} · 식샤 {menu.votes}명 평가</small>}</span></div></div>
          <p className="calorie-basis">{menu.low != null && menu.high != null && menu.confidence !== "직접 입력" ? `예상 ${menu.low.toLocaleString("ko-KR")}~${menu.high.toLocaleString("ko-KR")} kcal · ` : ""}{menu.basis || "예시 식단의 칼로리 추정치"}{menu.sourceUrl && <> · <a href={menu.sourceUrl} target="_blank" rel="noopener noreferrer">참고 자료</a></>}</p>
          <div className="menu-actions"><button disabled={isFuture} aria-pressed={selected.includes(menu.id)} className={selected.includes(menu.id) ? "logged" : ""} onClick={() => toggleSelection(menu.id)}>{selected.includes(menu.id) ? "✓ 먹은 기록 취소" : "＋ 먹었어요"}</button><button onClick={() => onEdit(menu)} aria-label={`${menu.name} 칼로리 수정`}>칼로리 수정</button><button aria-pressed={voteFor(menu) === "like"} onClick={() => onVote(menu.id, "like")}>👍{voteFor(menu) === "like" ? " 관심 표시됨" : " 관심"}</button><button aria-pressed={voteFor(menu) === "dislike"} onClick={() => onVote(menu.id, "dislike")}>👎{voteFor(menu) === "dislike" ? " 제외됨" : " 제외"}</button></div>
          {editingMenu === menu.id && <div className="calorie-editor"><label>확인한 칼로리 (kcal)<input type="number" min="1" max="5000" inputMode="numeric" value={editValue} onChange={event => setEditValue(event.target.value)} /></label><button onClick={() => onSaveCalories(menu.id)}>저장</button><button onClick={() => onResetCalories(menu.id)}>추정치로 되돌리기</button><button onClick={onCancelEdit}>취소</button></div>}
        </div>)}</div>
      </article>)}
      {!visibleMeals.length && <div className="empty"><span>🍽️</span><h3>{syncState === "loading" ? "식단을 불러오는 중" : "표시할 식단이 없어요"}</h3><p>{query ? "검색어를 바꾸거나 지워 주세요." : syncState === "error" ? "식샤 연결 상태를 확인하거나 나중에 다시 시도해 주세요." : "다른 날짜·끼니·식당을 선택하거나 빠진 식단을 직접 등록해 주세요."}</p><button onClick={() => setView("upload")}>식단 직접 등록</button></div>}
    </div>
  </>;
}

function UploadView({ defaultDate, defaultTime, onComplete }: { defaultDate: string; defaultTime: Meal["time"]; onComplete: (name: string, menu: string, date: string, time: Meal["time"]) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState<Meal["time"]>(defaultTime);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function readImage() {
    if (!file) return;
    setOcrState("working");
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(["kor", "eng"]);
      const result = await worker.recognize(file);
      const cleaned = cleanOcrText(result.data.text);
      setText(cleaned || result.data.text.trim());
      setOcrState(result.data.text.trim() ? "done" : "error");
    } catch {
      setOcrState("error");
    } finally {
      try { await worker?.terminate(); } catch { /* OCR result remains available. */ }
    }
  }

  return <section className="form-page"><p className="eyebrow">빠진 식단 직접 등록</p><h1>식단을 <em>직접 추가해요.</em></h1><p className="subcopy">① 날짜·식당·끼니를 고르고 ② 메뉴를 한 줄씩 입력한 뒤 ③ 아래 등록 버튼을 누르세요. 등록 결과는 선택한 날짜에만, 이 기기에만 표시됩니다.</p>
    <label className="field"><span>식단 날짜</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="field"><span>식당 이름</span><input value={name} onChange={event => setName(event.target.value)} placeholder="예: 학생회관 식당" /></label>
    <label className="field"><span>끼니</span><select value={time} onChange={event => setTime(event.target.value as Meal["time"])}><option>조식</option><option>중식</option><option>석식</option></select></label>
    <section className="upload-zone"><label htmlFor="menu-image"><strong>▧</strong><b>{file?.name || "식단 사진이 있다면 선택"}</b><span>이미지의 글자를 이 기기에서 읽어 아래 입력란에 채웁니다.</span></label><input id="menu-image" type="file" accept="image/*" onChange={event => { const next = event.target.files?.[0] || null; setFile(next && next.size <= 8_000_000 ? next : null); setOcrState(next && next.size > 8_000_000 ? "error" : "idle"); }} />{file && <button className="scan" disabled={ocrState === "working"} onClick={readImage}>{ocrState === "working" ? "한글 글자 인식 중…" : "사진에서 글자 읽기"}</button>}{ocrState === "done" && <p className="ocr-result">글자를 읽었습니다. 메뉴 이외의 글자를 지우고 이름·날짜·끼니를 꼭 확인해 주세요.</p>}{ocrState === "error" && <p className="ocr-error">사진을 읽지 못했어요. 8MB 이하의 선명한 이미지를 선택하거나 메뉴를 직접 입력해 주세요.</p>}</section>
    <label className="field"><span>메뉴 <small>한 줄에 한 메뉴, 최대 30개 · OCR 결과 수정 가능</small></span><textarea value={text} onChange={event => setText(event.target.value)} rows={7} placeholder={"예: 비빔밥\n미소된장국\n닭강정"} /></label>
    <div className="privacy-note">🔒 메뉴와 설정만 브라우저에 저장됩니다. 사진은 서버에 업로드하거나 저장하지 않지만, 글자 인식용 언어 파일을 처음 사용할 때 인터넷 연결이 필요합니다. 칼로리는 등록 후 추정치로 표시됩니다.</div>
    <button className="primary-button" disabled={!date || !text.trim() || ocrState === "working"} onClick={() => onComplete(name, text, date, time)}>이 날짜에 식단 등록 <span>→</span></button>
  </section>;
}

function RecordsView({ recordsByDate, onRemove }: { recordsByDate: Record<string, MealRecord[]>; onRemove: (date: string, id: string) => void }) {
  const dates = Object.keys(recordsByDate).filter(date => recordsByDate[date]?.length).sort((a, b) => b.localeCompare(a));
  const today = (recordsByDate[todayInSeoul()] || []).filter(item => item.confirmed === true);
  const todayTotal = today.reduce((sum, item) => sum + (item.kcal || 0), 0);
  return <section className="form-page records"><p className="eyebrow">나의 식사 기록</p><h1>기기에 남긴 <em>식사 기록</em></h1><p className="subcopy">식단에서 실제 먹은 메뉴의 ‘먹었어요’를 누르면 날짜별로 저장됩니다. 이전 버전의 단순 선택 기록은 ‘섭취 미확인’으로 남기고 칼로리 합계에서 제외합니다.</p>
    <div className="record-summary"><p>오늘 먹었다고 기록한 메뉴 <b>{today.length}개</b></p><strong>{formatKcal(todayTotal)}</strong></div>
    {dates.length ? dates.map(date => <section className="record-day" key={date}><h2>{date === todayInSeoul() ? "오늘" : dateLabel(date)} <small>섭취 확인 {recordsByDate[date].filter(item => item.confirmed === true).length}개 · {formatKcal(recordsByDate[date].filter(item => item.confirmed === true).reduce((sum, item) => sum + (item.kcal || 0), 0))}</small></h2><div className="record-list">{recordsByDate[date].map(item => <div key={item.id}><span className="mini-check">{item.confirmed ? "✓" : "?"}</span><p>{item.name}<small>{item.cafeteria} · {item.category}{!item.confirmed && " · 이전 선택(섭취 미확인)"}</small></p><b>{item.confirmed ? formatKcal(item.kcal) : "합계 제외"}</b><button className="record-remove" onClick={() => onRemove(date, item.id)} aria-label={`${item.name} 기록 삭제`}>삭제</button></div>)}</div></section>) : <div className="empty"><span>◷</span><h3>저장된 기록이 없어요</h3><p>오늘 또는 지난 날짜의 식단에서 먹은 메뉴를 기록해 보세요.</p></div>}
  </section>;
}

function ProfileView({ target, setTarget, targetKcal, setTargetKcal, preferredCategories, setPreferredCategories, allergies, setAllergies, dislikedIngredients, setDislikedIngredients, onClearData }: {
  target: string; setTarget: (value: string) => void; targetKcal: number; setTargetKcal: (value: number) => void; preferredCategories: string[]; setPreferredCategories: (value: string[]) => void; allergies: string[]; setAllergies: (value: string[]) => void; dislikedIngredients: string; setDislikedIngredients: (value: string) => void; onClearData: () => void;
}) {
  const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];
  const [targetInput, setTargetInput] = useState(String(targetKcal));
  useEffect(() => setTargetInput(String(targetKcal)), [targetKcal]);
  function commitTarget() {
    const value = Number(targetInput);
    if (Number.isFinite(value) && value >= 500 && value <= 5000) {
      setTarget("직접 설정");
      setTargetKcal(Math.round(value));
      setTargetInput(String(Math.round(value)));
    } else setTargetInput(String(targetKcal));
  }
  return <section className="form-page profile"><p className="eyebrow">내 식단 설정</p><h1>취향을 알수록<br /><em>추천은 더 정확해져요.</em></h1>
    <section className="local-card"><strong>이 기기에만 저장돼요</strong><p>로그인 없이 이 브라우저에 투표, 선택 기록, 설정, 직접 등록한 식단을 저장합니다. 다른 기기와 동기화되지 않으며 브라우저 데이터를 지우면 기록도 사라집니다.</p></section>
    <label className="field"><span>목표 유형</span><select value={target} onChange={e => setTarget(e.target.value)}><option>다이어트</option><option>유지</option><option>벌크업</option><option>직접 설정</option></select></label>
    <label className="field"><span>하루 목표 칼로리 (kcal)</span><input type="number" min="500" max="5000" step="50" inputMode="numeric" value={targetInput} onChange={event => setTargetInput(event.target.value)} onBlur={commitTarget} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small className="field-hint">500~5,000 kcal 범위에서 직접 바꾸고 입력칸을 벗어나면 저장돼요. 범위 밖 값은 이전 값으로 돌아갑니다. 의학적 권장량은 아닙니다.</small></label>
    <div className="preference"><span>선호 식단</span><div>{CATEGORY_OPTIONS.map(item => <button key={item} className={preferredCategories.includes(item) ? "chosen" : ""} aria-pressed={preferredCategories.includes(item)} onClick={() => setPreferredCategories(toggle(preferredCategories, item))}>{item}</button>)}</div></div>
    <div className="preference"><span>알레르기 또는 제외할 재료</span><div>{ALLERGY_OPTIONS.map(item => <button key={item} className={allergies.includes(item) ? "chosen" : ""} aria-pressed={allergies.includes(item)} onClick={() => setAllergies(toggle(allergies, item))}>{item}</button>)}</div><p className="preference-help">메뉴 이름에 표시된 재료만 추천에서 제외할 수 있습니다. 실제 알레르기 안전 여부는 식당에 꼭 확인해 주세요.</p></div>
    <label className="field"><span>그 밖에 피하고 싶은 재료 <small>쉼표로 구분</small></span><input value={dislikedIngredients} onChange={e => setDislikedIngredients(e.target.value)} placeholder="예: 버섯, 오이" /></label>
    <section className="privacy-card"><strong>내 기기 데이터</strong><p>저장된 투표, 식사 기록, 설정, 직접 등록한 식단, 칼로리 수정값을 한 번에 삭제할 수 있습니다. 삭제 후 복구할 수 없어요.</p><button onClick={onClearData}>내 데이터 모두 삭제</button></section>
  </section>;
}
