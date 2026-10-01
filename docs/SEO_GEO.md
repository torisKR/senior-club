# 시니어클럽 SEO·GEO 운영 기준

최종 점검일: 2026-07-30

이 문서는 검색엔진 최적화(SEO)와 생성형 검색 최적화(GEO)의 현재 구현 범위와 출시 후 운영값을
정리한다. 검색 순위나 AI 답변 인용을 보장하지 않으며, 실제 서비스 사실과 공개 API 데이터만
검색 가능한 근거로 사용한다.

## 브랜드와 공개 식별자

- 표준 한국어 서비스명: `시니어클럽`
- 영문 보조 표기: `Senior Club`
- 서비스 설명: 관심사가 같은 시니어와 중장년이 지역 모임을 찾고 활동 후 관계를 이어가는 목적 중심 커뮤니티
- 서비스 철학: `목적 → 사람 → 활동 → 관계`
- 실제 프로젝트 디렉터리: `/Users/toris/projects/senior_club`

`club-senior`, `clubsenior`, `com.toris.seniorclub`은 localStorage namespace, Expo 프로젝트,
딥링크 scheme, Android package와 같은 기술 식별자다. 사용자에게 보이는 앱 이름과 별개이며
Play Console·Firebase·EAS 연결이 확정된 뒤에는 임의로 변경하지 않는다.

## 5060 시니어 등산 코스 및 맞춤 취미 키워드 최적화 (SEO & GEO)

### 1. 타겟 검색어 및 검색 의도 (Search Intent)

- **완만한 등산 & 숲길**: `시니어 등산코스`, `5060 완만한 둘레길`, `무릎 안아픈 등산로`, `시니어 무장애 숲길`, `북한산 둘레길 시니어`, `남산 나눔둘레길`
- **인기 일상 취미생활**: `시니어 취미 추천`, `어르신 동호회`, `5060 모임`, `스마트폰 사진 모임`, `맨발 걷기 황톳길 동호회`, `시니어 가드닝`, `시니어 클래식 모임`, `은퇴 후 취미생활`, `시니어 건강 걷기`

### 2. 온페이지 및 AI 검색(GEO) 반영 내역

- **`src/lib/seo.ts`**: `SITE_KEYWORDS`에 시니어 롱테일 키워드 14개 추가 반영, 메타데이터 자동 주입.
- **`src/lib/llms-text.ts`**: AI 검색 에이전트(ChatGPT Search, Perplexity, Gemini, Claude)의 사실 기반 인용을 위해 대표 완만 등산코스 5선(북한산 둘레길, 남산 순환 나눔둘레길, 안산 자락길, 청계산 원터골, 관악산 호수공원)과 6대 추천 취미(등산, 스마트폰 사진, 맨발걷기, 가드닝, 클래식, 역사답사) 명시.
- **웹/모바일 홈 연계**: `SeniorHobbyCourseGuide`(Web) 및 `SeniorHobbyCourseSection`(Android) 컴포넌트를 통해 검색 유입자가 추천 코스 및 취미에서 실제 모임 신청으로 즉시 이어지도록 UI 동선 설계.

## 검색 가능한 공개 범위

| 경로 | 인덱싱 | 근거 |
| --- | --- | --- |
| `/` | 허용 | 서비스 설명과 공개 API 기반 추천 모임 |
| `/events` | 허용 | 공개 API 기반 모임 목록 |
| `/events/[id]` | 허용 | 실제 공개 API에 존재하는 모임 상세 |
| `/about` | 허용 | 서비스 설명, 이용 흐름, FAQ, 구현 범위 |
| `/clubs` | 허용 | 실제 공개 API 기반 커뮤니티 목록 |
| `/clubs/[slug]` | 허용 | 실제 공개 API에 존재하는 커뮤니티 상세 |
| `/clubs/[slug]/posts/**` | 차단 | 공개 열람은 가능하지만 사용자 생성 콘텐츠라 검색 색인 제외 |
| 로그인·회원·관리 화면 | 차단 | 개인화 또는 인증 필요 |
| 정책·계정 삭제 페이지 | 현재 차단 | 운영 주체·연락처·보유 기준이 확정되지 않은 초안 |

사이트맵은 공개 API를 사용할 수 없을 때 fixture 모임·커뮤니티 URL을 만들지 않는다. 공개 catalog는
한 시간 동안 재사용하며 모임은 예정/지난 목록 각 2페이지, 커뮤니티는 최대 4페이지까지만 읽어
크롤러 요청이 upstream API 전체 순회를 유발하지 않게 제한한다. 정책 문서를 확정한 뒤에는
법무·운영 검토를 거쳐 해당 페이지의 `noindex`와 사이트맵 포함 여부를 함께 변경한다.

## 구현된 SEO·GEO 기반

- `NEXT_PUBLIC_APP_URL` 우선의 canonical origin
- Sites production origin을 preview origin보다 우선
- 잘못된 HTTP 공개 URL, 인증 정보, 경로·쿼리·해시가 붙은 canonical 설정 거부
- 페이지별 title, description, canonical, Open Graph, Twitter card
- `Organization`, `WebSite`, `AboutPage`, `FAQPage`, `Event`, `CollectionPage`, `ItemList`,
  `BreadcrumbList` JSON-LD
- 실제 검색 폼과 연결된 `SearchAction`
- 공개 페이지와 실제 공개 모임·커뮤니티만 포함하는 `/sitemap.xml`
- `/api/`를 제외하고 일반 검색 crawler와 AI 검색·사용자 조회 crawler(`OAI-SearchBot`,
  `PerplexityBot`, `Claude-SearchBot`, `ChatGPT-User`, `Perplexity-User`, `Claude-User` 포함)의 공개
  페이지 접근을 허용하는 `/robots.txt`. `GPTBot`과 `ClaudeBot`은 모델 학습용 crawler로 구분한다.
  `Google-Extended`는 별도 요청 crawler가 아니라 Google이 수집한 공개 콘텐츠의 Gemini 학습·grounding
  사용 여부를 제어하는 token이며 Google Search 색인·순위에는 영향을 주지 않는다.
- 사람이 읽는 `/about`과 같은 사실을 요약하는 `/llms.txt`
- 초안·fixture·회원 전용 페이지의 `noindex`

`llms.txt`는 Google 검색 노출을 위한 필수 파일이 아니다. 다른 검색·AI 에이전트가 공개 서비스 범위와
정확성 한계를 빠르게 이해하도록 돕는 보조 문서이며, 사람이 보는 서비스 안내와 다른 주장을 만들지 않는다.

## 출시 전에 필요한 운영값

1. `NEXT_PUBLIC_APP_URL`에 경로가 없는 실제 production HTTPS origin을 설정한다.
2. 실제 운영 주체, 문의처, 개인정보 보유·삭제 기준을 확정하고 정책 초안을 승인한다.
3. Google Search Console과 Bing Webmaster Tools에서 production domain 소유권을 확인한다.
4. 사이트맵을 제출하고 canonical, robots, 구조화 데이터, 모바일 렌더링을 production 응답으로 검사한다.
5. Play Store 공개 후 실제 앱 URL이 확정되면 웹과 조직 구조화 데이터의 공식 연결 여부를 검토한다.
6. 서비스명 검색, 시니어 모임 찾기, 지역·관심사별 모임 찾기 같은 핵심 질의를 정하고 월별로
   노출·클릭·인용 여부를 기록한다.

허위 주소·전화번호·사용자 수·성과 통계·고정 참가비는 추가하지 않는다. 모임별 가격과 정원은
각 상세 페이지의 최신 공개 API 응답만 사용한다.
