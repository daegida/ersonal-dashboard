# 개인 대시보드

브라우저에서 보는 1페이지 개인 대시보드입니다. 기본은 `Next.js + SQLite` 로컬 웹앱으로 시작하고, 배포가 필요할 때는 `Supabase + Vercel`로 바로 확장할 수 있게 구성했습니다. 초보자도 수정하기 쉽도록 "화면 / API / DB 유틸"을 단순하게 나눴습니다.

## 1. 전체 기술구조 제안

### 추천 스택

- 프론트엔드: `Next.js(App Router)` + React
- 스타일링: 전역 CSS 한 파일
- 백엔드: Next.js Route Handler
- DB: `SQLite` 또는 `Supabase Postgres`
- 차트: `Recharts`
- 환경변수: `.env.local`

### 왜 이 조합인가

- 한 프로젝트 안에서 프론트엔드와 백엔드를 같이 관리할 수 있습니다.
- 배포 전에도 `npm run dev` 한 번으로 바로 실행할 수 있습니다.
- SQLite는 서버 준비 없이 로컬 파일 하나로 시작할 수 있어 초보자에게 부담이 적습니다.
- Supabase 환경변수를 넣으면 같은 코드가 외부 배포용 DB로 자동 전환됩니다.
- Vercel에 올리면 아이폰 LTE 같은 외부망에서도 계속 사용할 수 있습니다.

### 데이터 흐름

1. 사용자가 대시보드 페이지에 접속합니다.
2. 몸무게 / 러닝 / 관심종목은 DB 유틸에서 읽습니다.
3. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 없으면 SQLite를 씁니다.
4. Supabase 값이 있으면 Postgres로 자동 전환됩니다.
5. Strava 토큰도 Supabase가 있으면 DB에 저장되고, 없으면 로컬 파일에 저장됩니다.
6. 날씨는 서버 API(`/api/weather`)가 기상청 공식 API를 호출합니다.
7. 주식은 서버 API(`/api/market`)가 공식 연동용 provider를 호출합니다.
8. 입력 폼은 `/api/weights`, `/api/runs`, `/api/watchlist`로 저장합니다.

## 2. 폴더 구조

```text
personal-dashboard/
├── app/
│   ├── api/
│   │   ├── market/route.ts
│   │   ├── runs/route.ts
│   │   ├── watchlist/route.ts
│   │   ├── weather/route.ts
│   │   └── weights/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── dashboard.tsx
├── lib/
│   ├── db.ts
│   ├── format.ts
│   ├── market.ts
│   ├── strava.ts
│   ├── types.ts
│   └── weather.ts
├── supabase/
│   └── schema.sql
├── storage/
│   └── dashboard.sqlite   # 로컬 모드에서만 사용
├── .env.example
├── package.json
└── README.md
```

## 3. DB 스키마

### `watchlist_items`

```sql
CREATE TABLE watchlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `weight_entries`

```sql
CREATE TABLE weight_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL UNIQUE,
  target_weight REAL,
  actual_weight REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `running_entries`

```sql
CREATE TABLE running_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  distance_km REAL NOT NULL,
  duration_minutes REAL NOT NULL,
  avg_pace_seconds INTEGER NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `integration_tokens`

배포 시 Strava 토큰 저장용입니다.

```sql
CREATE TABLE integration_tokens (
  provider TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 4. 초기 화면 와이어프레임

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 개인 대시보드 헤더                                                  │
│ 오늘 날짜 / 로컬 저장 / 모바일 대응                                 │
├───────────────────────────────┬─────────────────────────────────────┤
│ 날씨                           │ 주식 / 지수                         │
│ - 현재 온도                    │ - 코스피 / 코스닥                   │
│ - 시간대별 카드                │ - 관심종목 추가 폼                  │
│ - 주간 예보 리스트             │ - 관심종목 현재가 리스트            │
├───────────────────────────────┼─────────────────────────────────────┤
│ 몸무게 관리                    │ 러닝 실적                           │
│ - 입력 폼                      │ - 입력 폼                           │
│ - 주간 계획/실적 라인차트      │ - 올해/당월/금주 요약               │
│ - 월간 차이 바차트             │ - 러닝 추이 차트                    │
│ - 최근 기록 테이블             │ - 최근 기록 테이블                  │
└───────────────────────────────┴─────────────────────────────────────┘
```

## 5. 실제 실행 가능한 코드 설명

### 현재 포함된 기능

- 날씨
  - 시간대별 날씨 카드
  - 주간 예보 카드
  - `KMA_SERVICE_KEY`가 있으면 기상청 API 사용
  - 없으면 데모 데이터로 화면은 바로 확인 가능
- 주식 / 지수
  - 코스피 / 코스닥 카드
  - 관심종목 추가 / 삭제
  - 종목 현재가 / 전일대비 / 등락률 표시
  - `MARKET_PROVIDER=kis`와 한국투자 Open API 키를 넣으면 관심종목 실시간 시세 구조 사용
- 몸무게
  - 날짜별 계획 / 실적 저장
  - 계획 대비 차이 표시
  - 주간 / 월간 차트
- 러닝
  - 날짜별 거리 / 시간 / 평균 페이스 저장
  - 올해 / 당월 / 금주 요약
  - 거리 / 페이스 차트

### API 메모

- 날씨 공식 API
  - 기상청 단기예보 조회서비스(공공데이터포털)
  - 기상청 중기예보 조회서비스(공공데이터포털)
- 주식 공식 API
  - 한국투자 Open API를 우선 확장 포인트로 잡음
  - 초기 버전에서는 코스피/코스닥 지수는 예시값으로 표기
  - 이유: 무료 공개형 공식 실시간 지수 API는 제약이 커서, 첫 버전은 구조를 먼저 단순하게 고정

## 6. 초보자 기준 실행 방법

### 1) 폴더 이동

```bash
cd /Users/haseung-gim/Documents/personal-dashboard
```

### 2) Node 22 사용

현재 이 Mac에서는 `nvm` 기반 Node를 쓰는 방식이 맞습니다.

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
```

### 3) 패키지 설치

```bash
npm install
```

### 4) 환경변수 파일 만들기

```bash
cp .env.example .env.local
```

기본 실행만 하려면 그대로 두어도 됩니다. 이 경우 날씨와 주식 일부는 데모 데이터로 나옵니다.

### 5) 개발 서버 실행

```bash
npm run dev
```

브라우저에서 아래 주소를 엽니다.

[http://localhost:3000](http://localhost:3000)

## 7. 외부망(LTE)에서도 계속 쓰는 방법

지금 코드는 로컬 SQLite와 Supabase를 모두 지원합니다.

### 추천 구성

- 배포: `Vercel`
- DB: `Supabase`

### 1) Supabase 프로젝트 생성

1. Supabase에서 새 프로젝트 생성
2. SQL Editor 열기
3. [schema.sql](/Users/haseung-gim/Documents/personal-dashboard/supabase/schema.sql) 내용을 실행
4. 프로젝트의 `Project URL`
5. `service_role` 키 복사

`.env.local` 또는 Vercel 환경변수에 아래 추가:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

이 두 값이 들어가면 앱은 SQLite 대신 Supabase를 사용합니다.

### 2) Vercel 배포

1. GitHub에 이 프로젝트 올리기
2. Vercel에서 저장소 import
3. Vercel 환경변수에 `.env.local` 값 입력
4. Deploy

배포가 끝나면 `https://...vercel.app` 주소가 생기고, 아이폰 LTE에서도 계속 접속할 수 있습니다.

### 3) OAuth Redirect URI 바꾸기

외부 배포 주소가 생기면 아래 값도 배포 주소로 바꿔야 합니다.

```env
STRAVA_REDIRECT_URI=https://YOUR-DOMAIN/api/strava/callback
```

Strava 앱 설정의 Redirect URI도 같은 값으로 맞춰야 합니다.

Google Calendar를 계속 쓸 경우에는 Google OAuth 설정에서도 배포 주소 기준으로 redirect URI를 다시 맞추는 게 좋습니다.

## 8. 실제 API 연결

### 1) 실제 기상청 API 연결

1. 공공데이터포털에서 기상청 단기예보 / 중기예보 API 활용신청
2. 발급받은 인증키를 `.env.local`의 `KMA_SERVICE_KEY`에 입력
3. 지역 격자와 지역 코드를 바꾸고 싶으면 아래도 수정

```env
KMA_GRID_X=60
KMA_GRID_Y=127
KMA_LOCATION_NAME=서울 강남구
KMA_MID_REGION_ID=11B00000
KMA_MID_STN_ID=109
```

### 2) 실제 주식 API 연결

1. 한국투자 Open API 신청
2. `.env.local`에 값 입력

```env
MARKET_PROVIDER=kis
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCESS_TOKEN=...
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
```

### 3) Google Calendar 실제 일정 연결

현재 앱에는 오늘 주요 일정 카드가 포함되어 있습니다.

- 이미 `refresh token`에 `calendar.readonly` 또는 `calendar` 스코프가 있으면:

```bash
cd /Users/haseung-gim/Documents/personal-dashboard
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
npm run calendar:cache
```

- 그 다음 `storage/calendar-cache.json`이 갱신되고, 대시보드에 오늘 실제 일정이 보입니다.

주의:
- 지금 보유한 토큰이 `Google Calendar 읽기 권한`이 부족하면 `403 insufficientPermissions`가 날 수 있습니다.
- 그 경우에는 같은 Google Cloud 프로젝트에서 `Google Calendar API` 읽기 스코프로 refresh token을 다시 발급받아야 합니다.

### 4) Strava 러닝 가져오기

1. [Strava API 앱 설정](https://www.strava.com/settings/api)에서 앱 생성
2. `.env.local`에 아래 추가

```env
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
```

3. 대시보드의 `데이터 입력 / 관리 > Strava 동기화`에서 `Strava 연결`
4. Strava 로그인 및 권한 허용
5. 다시 대시보드로 돌아오면 `최근 러닝 가져오기`

현재 구현 기준:
- 올해 러닝 활동을 Strava 공식 API에서 읽습니다
- `Run` 타입만 가져옵니다
- 이미 가져온 활동은 `source=strava`, `external_id` 기준으로 중복 저장하지 않습니다

### 10) Garmin Connect 확장 방향

- Garmin Connect는 공식 공개 API 사용성이 Strava보다 까다롭습니다
- 추천 첫 단계는 `Garmin 내보내기 파일(FIT/GPX/CSV) 업로드` 방식
- 그다음 필요하면 Garmin 연동 서비스나 HealthFit 중간 연동을 검토하는 편이 안정적입니다

## 9. 향후 가민 / 스트라바 연동 확장 포인트

### 가민 확장

- `lib/running-sync/garmin.ts` 같은 파일을 추가
- Garmin Connect 비공식 API 대신, 가능하면 export 파일 업로드 또는 중간 연동 서비스 사용
- 러닝 기록 저장 로직은 이미 `running_entries` 테이블로 분리되어 있어 importer만 붙이면 됩니다

### 스트라바 확장

- Strava OAuth 로그인 추가
- `strava_activities` 테이블을 별도로 두고 원본 데이터를 저장
- 동기화 후 `running_entries`에 필요한 필드만 정규화
- 평균 심박수, 고도상승, 케이던스 카드도 같은 패턴으로 확장 가능

### 추천 확장 순서

1. 현재 몸무게 / 러닝 입력 UX 먼저 다듬기
2. 실제 기상청 키 연결
3. 실제 주식 provider 정교화
4. Strava 연동
5. Garmin 또는 HealthKit 연동

## 8. 초보자 수정 포인트

- 화면 문구와 레이아웃: `/Users/haseung-gim/Documents/personal-dashboard/components/dashboard.tsx`
- 색상과 간격: `/Users/haseung-gim/Documents/personal-dashboard/app/globals.css`
- DB 저장 구조: `/Users/haseung-gim/Documents/personal-dashboard/lib/db.ts`
- 날씨 API: `/Users/haseung-gim/Documents/personal-dashboard/lib/weather.ts`
- 주식 API: `/Users/haseung-gim/Documents/personal-dashboard/lib/market.ts`

## 9. 참고한 공식 문서

- 기상청 단기예보 조회서비스: [data.go.kr 15084084](https://www.data.go.kr/data/15084084/openapi.do)
- 기상청 중기예보 조회서비스: [data.go.kr 15059468](https://www.data.go.kr/en/data/15059468/openapi.do)
- 한국투자 Open API 개발자센터: [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com/intro)
