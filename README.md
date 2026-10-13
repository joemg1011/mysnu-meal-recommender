# 오늘 뭐먹지? 마이스누 학식 추천

서울대학교 학생을 위한 모바일 우선 학식 추천 MVP입니다. 현재는 외부 키 없이 바로 체험할 수 있는 데모 모드이며, 텍스트 식단 등록, 이미지 OCR 흐름 시연, 메뉴 선택별 실시간 칼로리 합산, 취향 투표 및 개인화 추천 화면을 포함합니다.

## 실행

```powershell
npm.cmd install
npm.cmd run dev
```

브라우저에서 `http://localhost:3000`을 열어 확인합니다.

## Supabase 연결

`supabase/schema.sql`을 Supabase SQL Editor에서 실행한 뒤, 인증과 Storage 버킷을 연결하면 됩니다. OCR은 이미지 업로드 후 서버 Route Handler에서 Vision/OCR 공급자를 호출하도록 확장할 수 있습니다. 현재 이미지 OCR 버튼은 사용자가 실제 OCR 검수 흐름을 체험할 수 있는 데모 처리입니다.

추천 점수는 개인 과거 평가/선택, 전체 투표, 칼로리 목표, 알레르기·비선호 식재료를 결합하는 구조로 설계했습니다. 신규 사용자에게는 인기 메뉴와 초기 취향 설정을 제공합니다.

## 칼로리 정확도 개선 계획과 현재 구현

1. 완료: 식약처 [식품안전나라 외식 메뉴 1인분 자료](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22484)의 동일 메뉴 참고값을 우선 적용합니다. 이는 해당 학식의 실측치가 아닙니다.
2. 완료: 동일 메뉴가 없으면 밥 포함 여부, 반찬과 한 그릇 식사, 음료, 면, 세트 구성 등을 구분합니다. 임의의 단일 기본값을 없애고 예상 범위·추정 근거·신뢰도를 표시합니다. 뷔페나 안내 문구처럼 분량을 알 수 없는 항목은 ‘확인 필요’로 둡니다.
3. 완료: 메뉴별 칼로리를 직접 수정할 수 있습니다. 수정값은 이 브라우저에 날짜·메뉴별로 저장되며, 추정치로 되돌릴 수 있습니다. 미확인 메뉴는 선택 합계에서 제외하고 개수를 알려줍니다.
4. 다음 단계: 식약처 통합 영양성분 DB를 정기적으로 가져와 더 많은 음식의 1인분 기준값을 매칭하고, 식당별 실제 제공량과 영양표시를 확보해 계산값을 검증합니다. 현재 식샤 메뉴 응답에는 제공량이나 조리법이 없으므로 이 단계 없이 실제 섭취 열량을 확정할 수 없습니다.

계산 규칙은 `lib/calories.ts`, 대표적인 오분류 회귀 검사는 `tests/calories.test.mjs`에 있습니다. 검사는 `node --test tests/calories.test.mjs`로 실행합니다. 범위는 측정된 오차율이 아닌 분량과 조리법이 달라질 수 있음을 보여주는 참고 범위입니다.

## Google 로그인 연결

이 사이트는 GitHub Pages의 정적 페이지이므로 Supabase Auth의 브라우저 OAuth 흐름을 사용합니다. UI와 세션 복원·로그아웃은 구현되어 있습니다. 실제 로그인은 아래 외부 설정이 끝나야 활성화됩니다.

1. Supabase 프로젝트에서 `supabase/schema.sql`을 적용하고, 이어 `supabase/google-auth.sql`을 적용합니다. 두 번째 파일은 새 로그인 사용자의 프로필을 만들고 본인 프로필만 읽을 수 있도록 합니다.
2. Google Cloud Console에서 웹 애플리케이션 OAuth 클라이언트를 생성합니다. 승인된 JavaScript 원본은 `https://joemg1011.github.io`, 승인된 리디렉션 URI는 Supabase Dashboard의 Google Provider 페이지에 표시된 `https://<project-ref>.supabase.co/auth/v1/callback`을 사용합니다. Google 동의 화면의 `openid`, 이메일, 프로필 범위도 구성합니다.
3. Supabase Dashboard → Authentication → Providers → Google에서 Client ID와 Client Secret을 입력하고 활성화합니다. Client Secret은 코드나 GitHub 저장소에 넣지 않습니다.
4. Supabase Dashboard → Authentication → URL Configuration에서 Site URL을 `https://joemg1011.github.io/mysnu-meal-recommender/`로, Redirect URL에도 같은 주소를 추가합니다. 로컬 개발에는 `http://localhost:3000/`을 추가합니다.
5. GitHub 저장소 Settings → Secrets and variables → Actions → Variables에 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 넣고 Pages 워크플로를 다시 실행합니다. 이 둘은 공개용 연결 정보이며 service role key를 넣으면 안 됩니다. 로컬에서는 `.env.example`을 참고해 `.env.local`에 같은 값으로 설정합니다.

로그인 후 Google 이름 또는 이메일은 내 설정 화면에 표시됩니다. 현재 투표·선택·칼로리 수정은 로그인 계정에 아직 동기화되지 않습니다.
