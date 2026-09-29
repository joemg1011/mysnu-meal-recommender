"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Menu = {
  id: string;
  name: string;
  kcal: number;
  category: string;
  tags: string[];
  score: number;
  votes: number;
  confidence: "높음" | "보통" | "낮음";
};

type Meal = {
  id: string;
  cafeteria: string;
  location: string;
  time: "중식" | "석식";
  emoji: string;
  menu: Menu[];
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

function formatKcal(value: number) {
  return `${value.toLocaleString("ko-KR")} kcal`;
}

export default function Home() {
  const [view, setView] = useState("home");
  const [meals, setMeals] = useState(initialMeals);
  const [cafeteria, setCafeteria] = useState("전체 식당");
  const [selected, setSelected] = useState<string[]>(["beef", "rice", "pork", "greens"]);
  const [target, setTarget] = useState("유지");
  const [notice, setNotice] = useState("");
  const [vote, setVote] = useState<"like" | "dislike" | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const allMenu = meals.flatMap((meal) => meal.menu);
  const todayTotal = useMemo(
    () => allMenu.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.kcal, 0),
    [allMenu, selected]
  );
  const filteredMeals = cafeteria === "전체 식당" ? meals : meals.filter((meal) => meal.cafeteria === cafeteria);
  const progress = Math.min(100, Math.round((todayTotal / (target === "다이어트" ? 1550 : target === "벌크업" ? 2500 : 2000)) * 100));

  function toggleSelection(id: string) {
    setSelected((previous) => previous.includes(id) ? previous.filter((menuId) => menuId !== id) : [...previous, id]);
  }

  function registerVote(nextVote: "like" | "dislike") {
    setVote(nextVote);
    setNotice(nextVote === "like" ? "평가가 저장됐어요. 다음 추천에 반영할게요!" : "의견을 반영했어요. 더 잘 맞는 메뉴를 찾아볼게요.");
  }

  function addUploadedMeal(name: string, rawText: string) {
    const cleaned = rawText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
    if (!cleaned.length) {
      setNotice("읽어올 메뉴를 한 줄 이상 입력해 주세요.");
      return;
    }
    const newMeal: Meal = {
      id: `upload-${Date.now()}`,
      cafeteria: name || "새 식당",
      location: "사용자 등록 식단",
      time: "중식",
      emoji: "📋",
      menu: cleaned.map((menuName, index) => ({
        id: `custom-${Date.now()}-${index}`,
        name: menuName,
        kcal: [430, 170, 240, 85, 120][index] || 180,
        category: "사용자 등록",
        tags: ["추정"],
        score: 0,
        votes: 0,
        confidence: "낮음"
      }))
    };
    setMeals((previous) => [newMeal, ...previous]);
    setCafeteria("전체 식당");
    setView("home");
    setNotice("식단을 등록했어요. 칼로리는 메뉴를 눌러 수정할 수 있어요.");
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
          <button className="avatar" onClick={() => setView("profile")} aria-label="내 설정">J</button>
        </div>
      </header>

      <section className="app-shell">
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {view === "home" && <HomeView
          meals={filteredMeals}
          allMeals={meals}
          cafeteria={cafeteria}
          setCafeteria={setCafeteria}
          selected={selected}
          toggleSelection={toggleSelection}
          total={todayTotal}
          progress={progress}
          target={target}
          onVote={registerVote}
          vote={vote}
          setView={setView}
        />}
        {view === "upload" && <UploadView onComplete={addUploadedMeal} />}
        {view === "records" && <RecordsView selected={selected} allMenu={allMenu} total={todayTotal} />}
        {view === "profile" && <ProfileView target={target} setTarget={setTarget} onAdmin={() => setShowAdmin(true)} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      {showAdmin && <AdminSheet onClose={() => setShowAdmin(false)} />}
    </main>
  );
}

function HomeView({ meals, allMeals, cafeteria, setCafeteria, selected, toggleSelection, total, progress, target, onVote, vote, setView }: {
  meals: Meal[]; allMeals: Meal[]; cafeteria: string; setCafeteria: (value: string) => void; selected: string[]; toggleSelection: (id: string) => void; total: number; progress: number; target: string; onVote: (value: "like" | "dislike") => void; vote: "like" | "dislike" | null; setView: (view: string) => void;
}) {
  const recommendation = allMeals[1]?.menu[0] || allMeals[0].menu[0];
  return <>
    <section className="hero">
      <p className="eyebrow">9월 29일 화요일 · 중식</p>
      <h1>오늘, <em>무엇을 먹을까요?</em></h1>
      <p className="hero-copy">내 취향과 오늘의 칼로리 목표를 반영한<br />학식 추천을 확인해 보세요.</p>
      <div className="date-switcher"><button aria-label="어제">‹</button><strong>오늘</strong><button aria-label="내일">›</button></div>
    </section>

    <section className="recommend-card">
      <div className="recommend-top"><span className="sparkle">✦</span><span>오늘의 맞춤 추천</span><span className="match">92% 취향 일치</span></div>
      <div className="recommend-content">
        <div><p className="restaurant">{allMeals[1]?.cafeteria || "기숙사 식당"}</p><h2>{recommendation.name}</h2><p className="why">평소 양식 메뉴를 선호하고, 오늘 평점이 높아요.</p></div>
        <div className="food-emoji">🍝</div>
      </div>
      <div className="recommend-footer"><span>★ {recommendation.score} <small>({recommendation.votes}명)</small></span><span>{formatKcal(recommendation.kcal)} · 추정치</span></div>
      <div className="vote-row"><span>이 추천, 마음에 드나요?</span><button className={vote === "like" ? "selected-vote" : ""} onClick={() => onVote("like")}>👍 맛있어 보여요</button><button className={vote === "dislike" ? "selected-vote" : ""} onClick={() => onVote("dislike")}>👎 별로예요</button></div>
    </section>

    <section className="calorie-card">
      <div><p>오늘 선택한 메뉴</p><strong>{formatKcal(total)}</strong><span> / {target === "다이어트" ? "1,550" : target === "벌크업" ? "2,500" : "2,000"} kcal</span></div>
      <div className="ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></div>
      <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      <p className="calorie-caption">선택한 메뉴를 눌러 합계에 추가하거나 뺄 수 있어요.</p>
    </section>

    <section className="meal-heading"><div><p className="eyebrow">오늘의 식단</p><h2>어디서 먹을까요?</h2></div><button onClick={() => setView("upload")}>식단 등록 <span>＋</span></button></section>
    <div className="filter-row">
      {['전체 식당', ...allMeals.map((meal) => meal.cafeteria)].filter((item, index, items) => items.indexOf(item) === index).map((item) => <button className={cafeteria === item ? "chosen" : ""} key={item} onClick={() => setCafeteria(item)}>{item}</button>)}
    </div>
    <div className="time-tabs"><button className="active">중식 <small>11:30–14:00</small></button><button>석식 <small>17:00–19:00</small></button></div>
    <div className="meal-list">
      {meals.map((meal) => <article className="meal-card" key={meal.id}>
        <div className="meal-title"><div className="meal-icon">{meal.emoji}</div><div><h3>{meal.cafeteria}</h3><p>{meal.location} · {meal.time}</p></div><button className="more" aria-label={`${meal.cafeteria} 상세 보기`}>···</button></div>
        <div className="menu-list">{meal.menu.map((menu) => <button key={menu.id} className={`menu-item ${selected.includes(menu.id) ? "checked" : ""}`} onClick={() => toggleSelection(menu.id)}>
          <span className="check">{selected.includes(menu.id) ? "✓" : ""}</span><span className="menu-name">{menu.name}<small>{menu.tags.map(tag => <i key={tag}>{tag}</i>)}</small></span><span className="menu-meta"><b>{formatKcal(menu.kcal)}</b><small>{menu.confidence} 신뢰도</small></span>
        </button>)}</div>
        <div className="meal-bottom"><span>{meal.menu[0].score ? <>★ {meal.menu[0].score} <small>{meal.menu[0].votes}명 평가</small></> : "새로 등록된 식단"}</span><button>상세 보기 ›</button></div>
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
  return <section className="form-page"><p className="eyebrow">식단 데이터 등록</p><h1>오늘의 식단을<br /><em>함께 채워 주세요.</em></h1><p className="subcopy">마이스누 식단을 복사하거나 캡처 이미지를 올리면 돼요.</p>
    <div className="segmented"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>텍스트 붙여넣기</button><button className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}>이미지 OCR</button></div>
    <label className="field"><span>식당 이름</span><input value={name} onChange={e => setName(e.target.value)} placeholder="예: 학생회관 식당" /></label>
    {mode === "text" ? <label className="field"><span>식단 메뉴 <small>줄바꿈 또는 쉼표로 구분</small></span><textarea value={text} onChange={e => setText(e.target.value)} rows={7} /></label> : <div className="upload-zone"><input id="menu-image" type="file" accept="image/*" onChange={onFile} /><label htmlFor="menu-image"><strong>▧</strong><b>{fileName || "식단 이미지 선택"}</b><span>JPG, PNG를 올리면 메뉴를 읽어드려요.</span></label>{fileName && <button className="scan" onClick={() => { setParsed(true); setText("김치볶음밥\n계란후라이\n유부장국\n단무지"); }}>이미지에서 메뉴 읽기</button>}{parsed && <div className="ocr-result">✓ OCR 결과를 불러왔어요. 아래 메뉴를 확인해 주세요.</div>}</div>}
    {mode === "image" && parsed && <label className="field"><span>OCR 추출 결과 <small>수정 가능</small></span><textarea value={text} onChange={e => setText(e.target.value)} rows={5} /></label>}
    <div className="privacy-note">🔒 등록한 식단은 검수 후 공개됩니다. 메뉴별 칼로리는 영양 데이터와 평균 조리법으로 추정돼요.</div>
    <button className="primary-button" onClick={() => onComplete(name, text)}>식단 등록하고 칼로리 계산하기 <span>→</span></button>
  </section>;
}

function RecordsView({ selected, allMenu, total }: { selected: string[]; allMenu: Menu[]; total: number }) {
  const selectedMenu = allMenu.filter(item => selected.includes(item.id));
  return <section className="form-page records"><p className="eyebrow">나의 식사 기록</p><h1>오늘도 <em>잘 챙겨 먹었어요.</em></h1><div className="week-chart"><div className="chart-head"><span>이번 주 섭취 칼로리</span><b>평균 1,724 kcal</b></div><div className="bars">{[52, 77, 66, 93, 61, 80, 70].map((height, index) => <span key={index} className={index === 1 ? "today" : ""}><i style={{ height: `${height}%` }}></i><small>{["월", "화", "수", "목", "금", "토", "일"][index]}</small></span>)}</div></div><div className="record-summary"><p>오늘 선택한 메뉴 <b>{selectedMenu.length}개</b></p><strong>{formatKcal(total)}</strong></div><div className="record-list">{selectedMenu.length ? selectedMenu.map(item => <div key={item.id}><span className="mini-check">✓</span><p>{item.name}<small>{item.category} · 칼로리 추정치</small></p><b>{formatKcal(item.kcal)}</b></div>) : <p>아직 선택한 메뉴가 없어요.</p>}</div></section>;
}

function ProfileView({ target, setTarget, onAdmin }: { target: string; setTarget: (value: string) => void; onAdmin: () => void }) {
  return <section className="form-page profile"><p className="eyebrow">내 식단 설정</p><h1>취향을 알수록<br /><em>추천은 더 정확해져요.</em></h1><label className="field"><span>칼로리 목표</span><select value={target} onChange={e => setTarget(e.target.value)}><option>다이어트</option><option>유지</option><option>벌크업</option></select></label><div className="preference"><span>선호 식단</span><div><button className="chosen">한식</button><button className="chosen">양식</button><button>일식</button><button>샐러드</button></div></div><div className="preference"><span>알레르기 / 제외 식재료</span><div><button>없음</button><button>견과류</button><button>갑각류</button><button>유제품</button></div></div><section className="privacy-card"><strong>내 추천 데이터</strong><p>평가와 선택 기록은 개인화 추천에만 사용됩니다. 언제든 기록과 선호도를 삭제할 수 있어요.</p><button>내 데이터 삭제</button></section><button className="admin-link" onClick={onAdmin}>관리자 식단 검수 화면 열기 →</button></section>;
}

function AdminSheet({ onClose }: { onClose: () => void }) { return <div className="modal-backdrop"><section className="admin-sheet"><button className="close" onClick={onClose}>×</button><p className="eyebrow">관리자 · 검수 대기</p><h2>새 식단 3건</h2><div className="pending"><div><span>학생회관 식당</span><b>메뉴 OCR 신뢰도 78%</b></div><p>김치볶음밥 · 계란후라이 · 유부장국</p><button>검수 시작</button></div><div className="pending"><div><span>기숙사 식당</span><b>칼로리 미입력 2개</b></div><p>닭갈비 · 현미밥 · 콘샐러드</p><button>검수 시작</button></div></section></div>; }
