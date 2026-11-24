"use client";

import { useEffect, useRef, useState } from "react";
import { estimateCalories, userCalories } from "../lib/calories";
import { cleanOcrText, shiftDate, isDateString } from "../lib/meal-utils";
import { CATEGORY_OPTIONS, ALLERGY_OPTIONS, LOCAL_DATA_KEY, CALORIE_OVERRIDES_KEY, menuCategory, type Menu, type Meal, type SavedUpload, type MealRecord, type LocalData, type SyncState } from '../lib/meal-model';
import { sanitizeLocalData, sanitizeOverrides, summarizeRecords, canRecordMeal } from '../lib/meal-storage';
import { fetchSiksha, readMenuCache, writeMenuCache, CACHE_KEY } from '../lib/siksha';

function readLocalData(): LocalData | null {
  try { return sanitizeLocalData(JSON.parse(window.localStorage.getItem(LOCAL_DATA_KEY) || 'null')); } catch { return null; }
}
const ALLERGY_NAME_HINTS: Record<string,string[]> = {견과류:['견과','땅콩','호두','아몬드'],갑각류:['새우','꽃게','게살','대게','게장'],유제품:['우유','치즈','크림','버터','리코타'],계란:['계란','달걀','에그']};

const tabItems = [
  { id: "home", label: "홈", icon: "⌂" },
  { id: "upload", label: "식단 등록", icon: "＋" },
  { id: "chat", label: "AI 상담", icon: "✦" },
  { id: "records", label: "내 기록", icon: "◷" },
  { id: "profile", label: "내 설정", icon: "♙" }
];

function NavIcon({name}:{name:string}) {
  const paths:Record<string,string>={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',upload:'M12 5v14M5 12h14',chat:'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 9h8M8 13h5',records:'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9ZM12 7v5l3 2',profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2'};
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]}/></svg>;
}

function formatKcal(value: number | null) {
  return value === null ? "칼로리 확인 필요" : `${value.toLocaleString("ko-KR")} kcal`;
}

function readCalorieOverrides(): Record<string, number> {
  try { return sanitizeOverrides(JSON.parse(window.localStorage.getItem(CALORIE_OVERRIDES_KEY) || '{}')); } catch { return {}; }
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

export default function Home() {
  const [view, setViewState] = useState("home");
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
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [loadedDate, setLoadedDate] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAction = useRef<(() => void) | null>(null);
  function setView(value: string) { setViewState(value); setNotice(''); window.scrollTo(0,0); }
  useEffect(() => { if (!notice) return; const timer = setTimeout(()=>setNotice(''),5000); return ()=>clearTimeout(timer); },[notice]);
  const [menuDate, setMenuDate] = useState("");
  const [editingMenu, setEditingMenu] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [chatMenuId, setChatMenuId] = useState("");
  useEffect(() => {
    const saved = readLocalData();
    if (saved) {
      setRecordsByDate(saved.recordsByDate);
      setVotes(saved.votes);
      setTarget(saved.target);
      setTargetKcal(saved.targetKcal);
      setPreferredCategories(saved.preferredCategories);
      setAllergies(saved.allergies);
      setDislikedIngredients(saved.dislikedIngredients);
      setUploads(saved.uploads);

    }
    setMenuDate(todayInSeoul());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const data: LocalData = { version: 1, recordsByDate, votes, target, targetKcal, preferredCategories, allergies, dislikedIngredients, uploads };
    try { window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data)); }
    catch { setNotice("기기 저장 공간이 부족하거나 차단되어 기록을 저장하지 못했어요."); }
  }, [storageReady, recordsByDate, votes, target, targetKcal, preferredCategories, allergies, dislikedIngredients, uploads]);

  useEffect(() => {
    if (!storageReady || !menuDate) return;
    let active = true, request = 0;
    let controller: AbortController | null = null;
    const date = menuDate;
    const withOverrides = (items: Meal[]) => {
      const overrides = readCalorieOverrides();
      return items.map(meal=>({...meal,menu:meal.menu.map(menu=>{
        const refreshed={...menu,...estimateCalories(menu.name)};
        const entered=overrides[date+':'+menu.id];
        return entered ? {...refreshed,...userCalories(entered)} : refreshed;
      })}));
    };
    const local = () => uploads.filter(meal=>meal.date===date);
    const cached = () => { try {return readMenuCache(window.localStorage,date);} catch {return null;} };
    const initial = cached();
    setLoadedDate(date);
    setMeals(withOverrides([...local(),...(initial?.meals||[])]));
    setLastUpdated(initial?.fetchedAt||'');
    const load = async () => {
      const sequence=++request;
      controller?.abort(); controller=new AbortController();
      const current=controller;
      const timeout=setTimeout(()=>current.abort(),12000);
      setSyncState('loading');
      try {
        const result=await fetchSiksha(date,current.signal);
        if (!active || request!==sequence) return;
        const timestamp=new Date().toISOString();
        try {writeMenuCache(window.localStorage,date,result.payload,timestamp);} catch {}
        setMeals(withOverrides([...local(),...result.meals]));
        setLastUpdated(timestamp); setSyncState(result.meals.length?'live':'empty');
      } catch {
        if (!active || request!==sequence) return;
        const saved=cached();
        setMeals(withOverrides([...local(),...(saved?.meals||[])]));
        setLastUpdated(saved?.fetchedAt||''); setSyncState(saved?'cached':'error');
      } finally {clearTimeout(timeout);}
    };
    refreshAction.current=load;
    load();
    const timer=window.setInterval(load,10*60*1000);
    const reconnect=()=>load();
    window.addEventListener('online',reconnect);
    return ()=>{active=false;controller?.abort();window.clearInterval(timer);window.removeEventListener('online',reconnect);refreshAction.current=null;};
  },[storageReady,menuDate,uploads,refreshKey]);

  const currentMeals = loadedDate===menuDate ? meals : [];
  const selectedRecords = (recordsByDate[menuDate] || []).filter(item => item.confirmed === true && !item.example);
  const selected = selectedRecords.map(item => item.id);
  const todayTotal = selectedRecords.reduce((sum, item) => sum + (item.kcal || 0), 0);
  const unknownSelected = selectedRecords.filter(item => item.kcal === null).length;
  const filteredMeals = (cafeteria === "전체 식당" ? currentMeals : currentMeals.filter((meal) => meal.cafeteria === cafeteria))
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
    if (!meal || !menu || loadedDate!==menuDate || !canRecordMeal(menuDate,todayInSeoul(),id)) return;
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
    if (!isDateString(date)) {setNotice('올바른 식단 날짜를 선택해 주세요.');return;}
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
    try {window.localStorage.removeItem(CACHE_KEY);} catch {}
    setRefreshKey(key=>key+1);
    setNotice("이 기기에 저장된 내 데이터를 삭제했어요.");
  }

  return (
    <main>
      <header className="topbar">
        <button className="logo" onClick={() => setView("home")} aria-label="홈으로 이동">
          <span className="logo-mark">食</span>
          <span>오늘 뭐먹지?<small>서울대 식단 노트</small></span>
        </button>
        <div className="top-actions">
          <button className="login-shortcut" onClick={() => setView("profile")} aria-label="내 기기 저장 설정 열기">내 설정</button>
        </div>
      </header>

      <section className="app-shell">
        {notice && <div className="toast" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}>×</button></div>}
        {view === 'home' && !menuDate && <section className="startup" role="status"><p className="eyebrow">오늘 뭐먹지?</p><h1>오늘의 한 끼를 준비하고 있어요.</h1><p>저장한 기록과 식단을 확인하는 중입니다.</p></section>}
        {view === "home" && menuDate && <HomeView
          meals={filteredMeals}
          allMeals={currentMeals}
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
          syncState={loadedDate===menuDate?syncState:'loading'}
          lastUpdated={lastUpdated}
          onRefresh={()=>refreshAction.current?.()}
          menuDate={menuDate}
          setMenuDate={changeDate}
          onRemoveUpload={removeUpload}
          editingMenu={editingMenu}
          editValue={editValue}
          setEditValue={setEditValue}
          editWeight={editWeight}
          setEditWeight={setEditWeight}
          onEdit={(menu) => { setEditingMenu(menu.id); setEditValue(menu.kcal === null ? "" : String(menu.kcal)); setEditWeight(""); }}
          onCancelEdit={() => setEditingMenu(null)}
          onSaveCalories={saveCalories}
          onResetCalories={resetCalories}
          onAskAi={(meal, menu) => { setChatMenuId(`${meal.id}:${menu.id}`); setView("chat"); }}
        />}
        {view === "upload" && <UploadView defaultDate={menuDate} defaultTime={mealType} onComplete={addUploadedMeal} />}
        {view === "chat" && <ChatView meals={currentMeals} date={menuDate} selectedMenuId={chatMenuId} setNotice={setNotice} />}
        {view === "records" && <RecordsView recordsByDate={recordsByDate} onRemove={removeRecord} />}
        {view === "profile" && <ProfileView target={target} setTarget={updateTarget} targetKcal={targetKcal} setTargetKcal={setTargetKcal} preferredCategories={preferredCategories} setPreferredCategories={setPreferredCategories} allergies={allergies} setAllergies={setAllergies} dislikedIngredients={dislikedIngredients} setDislikedIngredients={setDislikedIngredients} onClearData={clearLocalData} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><NavIcon name={item.id}/>{item.label}</button>)}
      </nav>
    </main>
  );
}

function HomeView({ meals, allMeals, cafeteria, setCafeteria, mealType, setMealType, selected, toggleSelection, total, unknownSelected, progress, targetKcal, votes, preferredCategories, allergies, dislikedIngredients, recordsByDate, onVote, setView, syncState, lastUpdated, onRefresh, menuDate, setMenuDate, onRemoveUpload, editingMenu, editValue, setEditValue, editWeight, setEditWeight, onEdit, onCancelEdit, onSaveCalories, onResetCalories, onAskAi }: {
  meals: Meal[]; allMeals: Meal[]; cafeteria: string; setCafeteria: (value: string) => void; mealType: Meal["time"]; setMealType: (value: Meal["time"]) => void; selected: string[]; toggleSelection: (id: string) => void; total: number; unknownSelected: number; progress: number; targetKcal: number; votes: Record<string, "like" | "dislike">; preferredCategories: string[]; allergies: string[]; dislikedIngredients: string; recordsByDate: Record<string, MealRecord[]>; onVote: (id: string, value: "like" | "dislike") => void; setView: (view: string) => void; syncState: SyncState; lastUpdated: string; onRefresh: () => void; menuDate: string; setMenuDate: (date: string) => void; onRemoveUpload: (id: string) => void; editingMenu: string | null; editValue: string; setEditValue: (value: string) => void; editWeight: string; setEditWeight: (value: string) => void; onEdit: (menu: Menu) => void; onCancelEdit: () => void; onSaveCalories: (id: string) => void; onResetCalories: (id: string) => void; onAskAi: (meal: Meal, menu: Menu) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleMeals = query.trim() ? meals.map(meal => ({ ...meal, menu: meal.menu.filter(menu => menu.name.toLowerCase().includes(query.trim().toLowerCase()) || meal.cafeteria.toLowerCase().includes(query.trim().toLowerCase())) })).filter(meal => meal.menu.length) : meals;
  const relevantMeals = visibleMeals;
  const avoidTerms = [...allergies.flatMap(item => ALLERGY_NAME_HINTS[item] || [item]), ...dislikedIngredients.split(/[,\n]/).map(item => item.trim()).filter(Boolean)];
  const history = Object.values(recordsByDate).flat().filter(item=>item.confirmed && !item.example);
  const voteFor = (menu: Menu) => votes[`name:${menu.name.trim().toLowerCase()}`] || votes[menu.id];
  const candidates = relevantMeals.flatMap(meal => meal.menu).filter(menu => menu.kcal !== null && !/^(?:공기밥|쌀밥|현미밥|잡곡밥|백미밥|김치|깍두기|오이피클|단무지|시금치나물|반숙계란|삶은계란)$/.test(menu.name.replace(/\s/g,"")) && voteFor(menu) !== "dislike" && !avoidTerms.some(term => menu.name.includes(term)));
  const mealTarget = Math.round(targetKcal / 3);
  const recommendation = candidates.sort((first, second) => {
    const rank = (menu: Menu) => menu.score * 8 + Math.log1p(menu.votes) * 3
      + (preferredCategories.includes(menu.category) ? 22 : 0)
      + (voteFor(menu) === "like" ? 26 : voteFor(menu) === "dislike" ? -35 : 0)
      + Math.min(3, history.filter(item => item.name === menu.name).length) * 8
      + Math.max(0, 18 - Math.abs((menu.kcal || 0) - mealTarget) / 30) * (menu.confidence === "낮음" ? 0.35 : 1);
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
  return <div className="home-view">
    <section className="hero">
      <p className="eyebrow">{dateLabel(menuDate)} · {mealType}</p>
      <h1>{relativeDateLabel(menuDate)}, <em>무엇을 먹을까요?</em></h1>
      <p className="hero-copy">먹고 싶은 한 끼를 찾고, 나의 식사를 차곡차곡 기록해요.</p>
      <div className="date-switcher"><button onClick={() => setMenuDate(shiftDate(menuDate, -1))} aria-label="전날 식단">‹</button><strong>{relativeDateLabel(menuDate)}</strong><button onClick={() => setMenuDate(shiftDate(menuDate, 1))} aria-label="다음 날 식단">›</button></div>
      <label className="date-input">날짜 직접 선택 <input type="date" value={menuDate} onChange={event => { if (event.target.value) setMenuDate(event.target.value); }} /></label>
      {menuDate !== todayInSeoul() && <button className="today-shortcut" onClick={() => setMenuDate(todayInSeoul())}>오늘로 돌아가기</button>}
    </section>

    <section className="recommend-card">
      <div className="recommend-top"><span className="sparkle">✦</span><span>{relativeDateLabel(menuDate)}의 추천</span><span className="match">{hasPersonalData ? "내 취향 반영" : "메뉴 추천"}</span></div>
      {recommendation ? <><div className="recommend-content">
        <div><p className="restaurant">{recommendationRestaurant?.cafeteria || "식샤 연동 식당"}</p><h2>{recommendation.name}</h2><p className="why">{reason}</p></div>
        <div className="food-emoji">{recommendationRestaurant?.emoji || "🍽️"}</div>
      </div>
      <div className="recommend-footer"><span>{recommendation.score ? <>★ {recommendation.score.toFixed(1)} <small>({recommendation.votes}명)</small></> : "아직 평가 없음"}</span><span>{formatKcal(recommendation.kcal)} · {recommendation.confidence === "직접 입력" ? "직접 입력" : "추정치"}</span></div>
      <div className="vote-row"><span>추천 취향에 반영</span><button aria-pressed={voteFor(recommendation) === "like"} className={voteFor(recommendation) === "like" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "like")}>👍 관심 있어요</button><button aria-pressed={voteFor(recommendation) === "dislike"} className={voteFor(recommendation) === "dislike" ? "selected-vote" : ""} onClick={() => onVote(recommendation.id, "dislike")}>👎 관심 없어요</button></div></> : <p className="recommend-empty">{syncState === "loading" ? "식단을 불러오고 있어요." : "이 끼니에 추천할 메뉴가 없어요. 다른 끼니를 보거나 제외 재료를 확인해 주세요."}</p>}
    </section>

    <section className="calorie-card">
      <div><p>{relativeDateLabel(menuDate)} 섭취 기록 · 확인된 합계</p><strong>{formatKcal(total)}</strong><span> / 하루 목표 {targetKcal.toLocaleString("ko-KR")} kcal</span></div>
      <div className="ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></div>
      <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      <p className="calorie-caption">{isFuture ? "미래 날짜는 식사 기록을 남길 수 없어요." : "실제로 먹은 메뉴만 기록해 주세요. 합계는 기록한 메뉴만 포함해요."}{unknownSelected > 0 && ` 칼로리 미확인 ${unknownSelected}개는 합계에서 제외됐어요.`}</p>
    </section>

    <section className="meal-heading"><div><p className="eyebrow">{dateLabel(menuDate)} 식단</p><h2>어디서 먹을까요?</h2></div><button onClick={() => setView("upload")}>빠진 식단 직접 등록 <span>＋</span></button></section>
    <div className={`sync-status ${syncState}`} role="status">
      <span className="status-dot" aria-hidden="true"/>
      <div><strong>{syncState==='live'?'식샤 최신 식단':syncState==='loading'?'식단을 확인하고 있어요':syncState==='cached'?'연결이 끊겨 저장된 식단을 표시해요':syncState==='empty'?'이 날짜에 등록된 식샤 메뉴가 없어요':'식샤에 연결하지 못했어요'}</strong>
      <small>{lastUpdated ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(lastUpdated))+' 확인 · 10분마다 갱신' : '다른 날짜를 보거나 직접 식단을 등록할 수 있어요.'}</small></div>
      <button onClick={onRefresh} disabled={syncState==='loading'} aria-label="식샤 식단 새로고침">{syncState==='loading'?'확인 중…':'새로고침 ↻'}</button>
    </div>
    {allMeals.length>0 && <p className="estimate-summary">칼로리는 실제 제공량이 아닌 <b>참고 분량의 추정치</b>예요. 메뉴의 ‘추정 근거’를 펼치면 재료·중량을 확인할 수 있고, 실제 먹은 양으로 수정할 수 있어요.</p>}
    <div className="filter-row" aria-label="식당 필터">
      {['전체 식당', ...allMeals.map((meal) => meal.cafeteria)].filter((item, index, items) => items.indexOf(item) === index).map((item) => <button className={cafeteria === item ? "chosen" : ""} key={item} aria-pressed={cafeteria===item} onClick={() => setCafeteria(item)}>{item}</button>)}
    </div>
    <div className="time-tabs three"><button className={mealType === "조식" ? "active" : ""} aria-pressed={mealType==="조식"} onClick={() => setMealType("조식")}>조식</button><button className={mealType === "중식" ? "active" : ""} aria-pressed={mealType==="중식"} onClick={() => setMealType("중식")}>중식</button><button className={mealType === "석식" ? "active" : ""} aria-pressed={mealType==="석식"} onClick={() => setMealType("석식")}>석식</button></div>
    <label className="menu-search">식당·메뉴 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 제육볶음, 학생회관" /></label>
    <p className="result-count">{mealType} · {visibleMeals.length}곳 · {visibleMeals.reduce((sum,meal)=>sum+meal.menu.length,0)}개 메뉴{cafeteria!=='전체 식당'?' · '+cafeteria:''}</p>
    <div className="meal-list" aria-busy={syncState==='loading'}>
      {visibleMeals.map((meal) => <article className="meal-card" key={meal.id}>
        <div className="meal-title"><div className="meal-icon">{meal.emoji}</div><div><h3>{meal.cafeteria}</h3><p>{meal.location} · {meal.time}</p></div>{meal.id.startsWith("upload-") && <button className="record-remove" onClick={() => onRemoveUpload(meal.id)} aria-label={`${meal.cafeteria} 직접 등록 식단 삭제`}>삭제</button>}</div>
        <div className="menu-list">{meal.menu.map((menu) => <div className="menu-entry" key={menu.id}>
          <div className="menu-entry-top"><div className="menu-item"><span className="menu-name">{menu.name}<small>{menu.tags.map(tag => <i key={tag}>{tag}</i>)}</small></span><span className="menu-meta"><b>{formatKcal(menu.kcal)}</b><small>{menu.price ? `${menu.price.toLocaleString("ko-KR")}원 · ` : ""}{menu.confidence === "직접 입력" ? "직접 입력" : `${menu.confidence} 신뢰도`}</small>{menu.votes > 0 && <small>★ {menu.score.toFixed(1)} · 식샤 {menu.votes}명 평가</small>}</span></div></div>
          <details className="calorie-details"><summary>추정 근거·분량 보기</summary><p className="calorie-basis">{menu.low != null && menu.high != null && menu.confidence !== "직접 입력" ? `예상 ${menu.low.toLocaleString("ko-KR")}~${menu.high.toLocaleString("ko-KR")} kcal · ` : ""}{menu.basis || "참고 분량에 따른 추정치"}{menu.sourceUrl && <> · <a href={menu.sourceUrl} target="_blank" rel="noopener noreferrer">참고 자료</a></>}</p></details>
          <div className="menu-actions"><button disabled={isFuture || !canRecordMeal(menuDate,todayInSeoul(),menu.id)} aria-pressed={selected.includes(menu.id)} className={selected.includes(menu.id) ? "logged" : ""} onClick={() => toggleSelection(menu.id)}>{selected.includes(menu.id) ? "✓ 기록됨 · 취소" : "＋ 먹었어요"}</button><button onClick={() => onEdit(menu)} aria-expanded={editingMenu===menu.id} aria-label={`${menu.name} 칼로리와 분량 수정`}>칼로리·분량 수정</button><button onClick={() => onAskAi(meal, menu)} aria-label={`${menu.name} ChatGPT 질문 준비`}>AI에게 묻기</button><button aria-pressed={voteFor(menu) === "like"} onClick={() => onVote(menu.id, "like")}>👍{voteFor(menu) === "like" ? " 관심 표시됨" : " 관심"}</button><button aria-pressed={voteFor(menu) === "dislike"} onClick={() => onVote(menu.id, "dislike")}>👎{voteFor(menu) === "dislike" ? " 제외됨" : " 제외"}</button></div>
          {editingMenu === menu.id && <div className="calorie-editor">
            {estimateCalories(menu.name).kcal !== null && <div className="portion-controls"><span>참고 1인분과 비교해 실제 먹은 양을 선택하세요.</span><div>{[0.5, 1, 1.5, 2].map(portion => <button type="button" key={portion} onClick={() => setEditValue(String(Math.round((estimateCalories(menu.name).kcal || 0) * portion)))}>{portion}인분</button>)}</div></div>}
            {menu.perBasisKcal && menu.basisAmount && <div className="weight-controls"><label>실제 먹은 중량 ({menu.amountUnit})<input type="number" min="1" max="2000" inputMode="decimal" value={editWeight} onChange={event => setEditWeight(event.target.value)} placeholder={`예: ${menu.basisAmount}`} /></label><button type="button" disabled={!Number.isFinite(Number(editWeight)) || Number(editWeight) <= 0 || Number(editWeight) > 2000} onClick={() => setEditValue(String(Math.round(menu.perBasisKcal! * Number(editWeight) / menu.basisAmount!)))}>중량으로 계산</button><small>식약처 {menu.basisAmount}{menu.amountUnit}당 {menu.perBasisKcal} kcal 기준</small></div>}
            <label>칼로리 수정 (kcal)<input type="number" min="1" max="5000" inputMode="numeric" value={editValue} onChange={event => setEditValue(event.target.value)} /></label><button onClick={() => onSaveCalories(menu.id)}>저장</button><button onClick={() => onResetCalories(menu.id)}>추정치로 되돌리기</button><button onClick={onCancelEdit}>취소</button>
            <p>인분·중량 계산 후 ‘저장’을 눌러 반영하세요. 식당 영양표시가 있다면 kcal를 직접 입력해 주세요.</p>
          </div>}
        </div>)}</div>
      </article>)}
      {!visibleMeals.length && <div className="empty"><span>🍽️</span><h3>{syncState === "loading" ? "식단을 불러오는 중" : "표시할 식단이 없어요"}</h3><p>{query ? "검색어를 바꾸거나 지워 주세요." : syncState === "error" ? "식샤 연결 상태를 확인하거나 나중에 다시 시도해 주세요." : "다른 날짜·끼니·식당을 선택하거나 빠진 식단을 직접 등록해 주세요."}</p><button onClick={() => setView("upload")}>식단 직접 등록</button></div>}
    </div>
  </div>;
}

function ChatView({ meals, date, selectedMenuId, setNotice }: { meals: Meal[]; date: string; selectedMenuId: string; setNotice: (value: string) => void }) {
  const [menuId, setMenuId] = useState(selectedMenuId);
  const [menuQuery, setMenuQuery] = useState("");
  const [details, setDetails] = useState("");
  const [question, setQuestion] = useState("이 식단의 칼로리 추정이 타당한지 검토하고 더 정확히 추정하려면 무엇을 확인해야 할까?");
  const options = meals.flatMap(meal => meal.menu.map(menu => ({ key: `${meal.id}:${menu.id}`, menu, cafeteria: meal.cafeteria, time: meal.time })));
  const selected = options.find(option => option.key === menuId);
  const matches = options.filter(option => `${option.cafeteria} ${option.menu.name}`.toLowerCase().includes(menuQuery.trim().toLowerCase())).slice(0, 40);
  const visibleOptions = selected && !matches.some(option => option.key === selected.key) ? [selected, ...matches] : matches;
  const prompt = [
    "서울대 학식 메뉴의 칼로리를 검토해 줘. 메뉴명만으로 실제 칼로리를 확정하지 말고, 모르는 양·재료·조리법은 질문해 줘. 가능하면 음식별 근거, 분량 가정, 합산 과정과 범위(kcal)를 보여 줘. 출처를 확인하지 못한 수치는 추정이라고 밝혀 줘.",
    selected ? `날짜: ${date}\n식당: ${selected.cafeteria}\n끼니: ${selected.time}\n메뉴: ${selected.menu.name}\n현재 사이트 추정: ${selected.menu.kcal === null ? "확인 필요" : `${selected.menu.kcal} kcal (범위 ${selected.menu.low ?? "미상"}~${selected.menu.high ?? "미상"} kcal)`}\n현재 근거: ${selected.menu.basis || "없음"}` : "메뉴: 아래 추가 정보에 적은 음식",
    details.trim() ? `내가 확인한 분량·재료·영양표시: ${details.trim()}` : "분량·재료·영양표시는 아직 확인하지 못했음",
    `질문: ${question.trim() || "칼로리 추정을 검토해 줘."}`
  ].join("\n\n");

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setNotice("질문을 복사했어요. ChatGPT에 붙여넣어 대화를 시작하세요."); }
    catch { setNotice("자동 복사에 실패했어요. 아래 질문을 직접 선택해 복사해 주세요."); }
  }

  return <section className="form-page chat-page">
    <p className="eyebrow">칼로리 검토 도우미</p>
    <h1>ChatGPT와 <em>함께 확인해요.</em></h1>
    <p className="subcopy">식단과 추정 근거를 질문에 담아 드립니다. 질문을 복사한 뒤 ChatGPT를 열어 붙여넣으세요. 대화는 이 사이트 안에서 진행되지 않습니다.</p>
    <label className="field"><span>검토할 메뉴 검색</span><input type="search" value={menuQuery} onChange={event => setMenuQuery(event.target.value)} placeholder="메뉴명이나 식당명을 입력하세요" /></label>
    <label className="field"><span>검토할 메뉴 <small>검색 결과 최대 40개</small></span><select value={menuId} onChange={event => setMenuId(event.target.value)}><option value="">메뉴를 직접 설명할게요</option>{visibleOptions.map(({ key, menu, cafeteria, time }) => <option key={key} value={key}>{cafeteria} · {time} · {menu.name}</option>)}</select></label>
    <label className="field"><span>알고 있는 분량·재료·영양표시 <small>선택 입력</small></span><textarea rows={3} value={details} onChange={event => setDetails(event.target.value)} placeholder="예: 밥 반 공기, 제육 약 120g, 포장지에 650 kcal 표시" /></label>
    <label className="field"><span>궁금한 점</span><textarea rows={3} value={question} onChange={event => setQuestion(event.target.value)} /></label>
    <label className="field"><span>복사할 질문 미리보기</span><textarea rows={12} readOnly value={prompt} onFocus={event => event.currentTarget.select()} /></label>
    <div className="chat-actions"><button className="primary-button" onClick={copyPrompt}>질문 복사</button><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT 새 탭 열기 ↗</a></div>
    <p className="privacy-note">🔒 자동 전송은 하지 않습니다. 붙여넣은 내용은 ChatGPT의 서비스 정책에 따라 처리됩니다. AI가 제시한 칼로리도 추정치이며, 실제 제공량·조리법 또는 식당의 영양표시가 더 중요합니다.</p>
  </section>;
}

function UploadView({ defaultDate, defaultTime, onComplete }: { defaultDate: string; defaultTime: Meal["time"]; onComplete: (name: string, menu: string, date: string, time: Meal["time"]) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState<Meal["time"]>(defaultTime);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "working" | "done" | "error">("idle");
  const alive = useRef(true);
  const workerRef = useRef<Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null>(null);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;workerRef.current?.terminate().catch(()=>{});};},[]);

  async function readImage() {
    if (!file) return;
    setOcrState("working");
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(["kor", "eng"]);
      workerRef.current=worker;
      if (!alive.current) return;
      const result = await worker.recognize(file);
      if (!alive.current) return;
      const cleaned = cleanOcrText(result.data.text);
      setText(cleaned || result.data.text.trim());
      setOcrState(result.data.text.trim() ? "done" : "error");
    } catch {
      if (alive.current) setOcrState("error");
    } finally {
      try { await worker?.terminate(); } catch { /* OCR result remains available. */ }
      workerRef.current=null;
    }
  }

  return <section className="form-page"><p className="eyebrow">빠진 식단 직접 등록</p><h1>식단을 <em>직접 추가해요.</em></h1><p className="subcopy">① 날짜·식당·끼니를 고르고 ② 메뉴를 한 줄씩 입력한 뒤 ③ 아래 등록 버튼을 누르세요. 등록 결과는 선택한 날짜에만, 이 기기에만 표시됩니다.</p>
    <label className="field"><span>식단 날짜</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="field"><span>식당 이름</span><input value={name} onChange={event => setName(event.target.value)} placeholder="예: 학생회관 식당" /></label>
    <label className="field"><span>끼니</span><select value={time} onChange={event => setTime(event.target.value as Meal["time"])}><option>조식</option><option>중식</option><option>석식</option></select></label>
    <section className="upload-zone"><label htmlFor="menu-image"><strong>▧</strong><b>{file?.name || "식단 사진이 있다면 선택"}</b><span>이미지의 글자를 이 기기에서 읽어 아래 입력란에 채웁니다.</span></label><input id="menu-image" type="file" disabled={ocrState === "working"} accept="image/*" onChange={event => { const next = event.target.files?.[0] || null; setFile(next && next.size <= 8_000_000 ? next : null); setOcrState(next && next.size > 8_000_000 ? "error" : "idle"); }} />{file && <button className="scan" disabled={ocrState === "working"} onClick={readImage}>{ocrState === "working" ? "한글 글자 인식 중…" : "사진에서 글자 읽기"}</button>}{ocrState === "done" && <p className="ocr-result">글자를 읽었습니다. 메뉴 이외의 글자를 지우고 이름·날짜·끼니를 꼭 확인해 주세요.</p>}{ocrState === "error" && <p className="ocr-error">사진을 읽지 못했어요. 8MB 이하의 선명한 이미지를 선택하거나 메뉴를 직접 입력해 주세요.</p>}</section>
    <label className="field"><span>메뉴 <small>한 줄에 한 메뉴, 최대 30개 · OCR 결과 수정 가능</small></span><textarea disabled={ocrState === "working"} value={text} onChange={event => setText(event.target.value)} rows={7} placeholder={"예: 비빔밥\n미소된장국\n닭강정"} /></label>
    <div className="privacy-note">🔒 메뉴와 설정만 브라우저에 저장됩니다. 사진은 서버에 업로드하거나 저장하지 않지만, 글자 인식용 언어 파일을 처음 사용할 때 인터넷 연결이 필요합니다. 칼로리는 등록 후 추정치로 표시됩니다.</div>
    <button className="primary-button" disabled={!date || !text.trim() || ocrState === "working"} onClick={() => onComplete(name, text, date, time)}>이 날짜에 식단 등록 <span>→</span></button>
  </section>;
}

function RecordsView({ recordsByDate, onRemove }: { recordsByDate: Record<string, MealRecord[]>; onRemove: (date: string, id: string) => void }) {
  const dates=Object.keys(recordsByDate).filter(date=>recordsByDate[date]?.length).sort((a,b)=>b.localeCompare(a));
  const today=summarizeRecords(recordsByDate[todayInSeoul()]||[]);
  return <section className="form-page records"><p className="eyebrow">MY MEAL JOURNAL</p><h1>차곡차곡, <em>나의 한 끼.</em></h1><p className="subcopy">먹었다고 확인한 메뉴만 합계에 반영해요. 예전 예시 메뉴는 보관하되 합계에서 제외합니다.</p>
    <div className="record-summary"><p>오늘의 확인된 합계 <b>{today.count}개 기록</b></p><strong>{formatKcal(today.total)}</strong>{today.unknown>0&&<small>칼로리 미확인 {today.unknown}개는 합계에서 제외했어요.</small>}</div>
    {dates.length?dates.map(date=>{const summary=summarizeRecords(recordsByDate[date]);return <section className="record-day" key={date}><h2>{date===todayInSeoul()?'오늘':dateLabel(date)}<small>{summary.count}개 기록 · 확인된 합계 {formatKcal(summary.total)}{summary.unknown>0?` · 미확인 ${summary.unknown}개 제외`:''}</small></h2><div className="record-list">{recordsByDate[date].map(item=><div key={item.id}><span className="mini-check">{item.confirmed?'✓':'?'}</span><p>{item.name}<small>{item.cafeteria} · {item.category}{item.example?' · 이전 예시 메뉴':!item.confirmed?' · 섭취 미확인':''}</small></p><b>{item.confirmed&&!item.example?formatKcal(item.kcal):'합계 제외'}</b><button className="record-remove" onClick={()=>onRemove(date,item.id)} aria-label={item.name+' 기록 삭제'}>삭제</button></div>)}</div></section>}) : <div className="empty"><span>◷</span><h3>아직 기록된 한 끼가 없어요</h3><p>홈에서 실제로 먹은 메뉴의 ‘먹었어요’를 눌러 보세요.</p></div>}
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
