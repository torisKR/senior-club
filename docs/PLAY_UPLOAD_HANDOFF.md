# Play Console 업로드 인수 문서

작성일: 2026-07-30

이 문서는 시니어클럽 Android 앱을 Google Play Console에 직접 업로드할 때 필요한 값과 남은 작업만 모았다.

## 1. 완료된 것

| 항목 | 값 |
| --- | --- |
| Play Console 앱 | 생성 완료 (이름 `시니어클럽`, 기본 언어 `한국어 – ko-KR`, 앱/무료) |
| 앱 ID | `4972151297890422177` |
| 개발자 계정 | 유주환 (`6912640494861955983`) |
| 패키지 이름 | `com.toris.seniorclub` |
| 서명된 AAB | `../apps/mobile/build-output/app-seniorclub-v5.aab` (81MB) |
| AAB SHA-256 | `d07908ff85ad380e6d915fabc71aa69fb5b0ae74e4ef33e0aa83a956e70a946f` |
| versionName / versionCode | `0.1.0` / `6` |
| API URL (번들에 포함) | `https://d33totqtaqpyfs.cloudfront.net` (검증 완료) |
| Firebase 프로젝트 | `clubsenior-app` (프로젝트 번호 `982568561637`) |
| Firebase Android 앱 ID | `1:982568561637:android:0005fb64d823de045f1d0c` |

### 업로드 keystore

| 항목 | 값 |
| --- | --- |
| 경로 | `~/keystores/clubsenior-upload.keystore` |
| alias | `clubsenior-upload` |
| 비밀번호 (store/key 동일) | `~/keystores/clubsenior-upload.password` 파일 참조 |
| 인증서 만료 | 2053-12-15 |
| EAS 로컬 참조 | `../apps/mobile/credentials.json` (git ignore 처리됨) |

**이 keystore를 잃어버리면 앱 업데이트를 올릴 수 없다.** 별도 백업을 권장한다.

## 2. Play Console에 입력할 텍스트

### 앱 이름 (30자 이내)

```
시니어클럽
```

### 간단한 설명 (80자 이내)

```
관심사와 지역으로 시니어 취미 모임을 찾고 안전하게 신청하는 커뮤니티
```

### 자세한 설명 (4000자 이내)

원문은 `../apps/mobile/store-listing/ko-KR/full-description.txt`에 있다. 그대로 복사해 붙여넣으면 된다.

### 릴리스 노트

`../apps/mobile/store-listing/ko-KR/release-notes-0.1.0.txt` 참조.

## 3. 업로드할 그래픽 파일 경로

| Play Console 항목 | 파일 |
| --- | --- |
| 앱 아이콘 (512×512) | `../apps/mobile/store-listing/icon-512-v2.png` |
| 그래픽 이미지 (1024×500) | `../apps/mobile/store-listing/feature-graphic-1024x500-v2.png` |
| 휴대전화 스크린샷 (2~8장) | `../apps/mobile/store-listing/screenshots/phone/` 6장 |
| 7인치 태블릿 스크린샷 | `../apps/mobile/store-listing/screenshots/tablet-7/` 4장 |
| 10인치 태블릿 스크린샷 | `../apps/mobile/store-listing/screenshots/tablet-10/` 4장 |

프로모션 노출을 원하면 각 변이 1080px 이상인 스크린샷이 4장 이상 필요하다.

## 4. 남은 Play Console 작업

### 앱 콘텐츠

1. **개인정보처리방침** — `https://clubsenior.vercel.app/privacy` (페이지 실제 로드 및 내용 확정 필요)
2. **앱 액세스 권한** — 휴대폰 SMS OTP 로그인이 필요하므로 심사용 테스트 번호와 SMS 수신 절차를 제공
3. **광고** — 광고 없음
4. **콘텐츠 등급** — 설문 작성 (UGC 있음: 게시글·댓글·후기·채팅)
5. **타겟층** — 성인 대상, 아동 대상 아님
6. **데이터 보안** — `DATA_SAFETY.md` 기준으로 작성
7. **정부 앱 / 금융 기능 / 건강** — 모두 해당 없음
8. **계정 삭제 URL** — `https://clubsenior.vercel.app/account-deletion`

### 출시

9. **앱 카테고리** — 소셜 또는 라이프스타일, 연락처 이메일 등록
10. **내부 테스트 트랙에 AAB 업로드** → Play App Signing 자동 등록됨
11. **App Bundle Explorer에서 확인** — package `com.toris.seniorclub`, versionCode `6`, target API 36, 서명 상태
12. **비공개 테스트** — 2023-11-13 이후 만든 개인 개발자 계정이면 테스터 12명 × 14일 요건 확인 (조직 계정이면 미적용)

## 5. AWS 백엔드 (서울, ap-northeast-2)

| 항목 | 값 |
| --- | --- |
| API HTTPS | `https://d33totqtaqpyfs.cloudfront.net` — `/healthz` 200, `/readyz` 200 |
| CloudFront | `E1CZ7895HL6MWG` (ALB 앞단, HTTPS 종료) |
| ALB | `senior-club-alb-1510403427.ap-northeast-2.elb.amazonaws.com` |
| ECS | 클러스터 `senior-club`, 서비스 `senior-club-api` (Fargate 0.25 vCPU / 512MB) |
| RDS | `senior-club-db.cbo8a62u6q1k.ap-northeast-2.rds.amazonaws.com` (db.t4g.micro) |
| DB 비밀번호 | `~/.senior-club/rds-password` |
| 시크릿 | Secrets Manager `senior-club/api` |
| 월 비용 | 약 $44 |
| 테스트 계정 | 심사용 휴대폰 번호 (SMS 인증·온보딩·약관 동의 완료) |

DB 마이그레이션과 시드 데이터는 적용 완료 상태다. 테스트 계정 로그인은 비밀번호가 아니라 휴대폰
SMS OTP를 쓴다.

`AUTH_DEV_OTP_EXPOSE`는 `false`다. API가 공개 인터넷에 열려 있어 응답에 인증번호를 담으면 이메일
주소만 아는 사람이 아무 계정으로나 로그인할 수 있기 때문이다. `EMAIL_PROVIDER=console`이라 메일도
나가지 않으므로, 테스트 계정으로 로그인하려면 개발 환경 로그에서 인증번호를 직접 조회한다.

```bash
aws logs tail /ecs/senior-club-api --since 5m
```

DB 접속은 `sslmode=verify-full`이며 RDS 공개 CA 번들이 이미지 `/app/rds-ca.pem`에 들어 있다
(이미지 태그 `0.1.1`, 태스크 정의 revision 3).

## 6. 아직 검증되지 않은 것

- **현재 배포는 `NODE_ENV=development`다.** API가 production 모드에서 `RESEND_API_KEY`와
  `FCM_SERVICE_ACCOUNT_JSON_BASE64`를 필수로 요구해 기동에 실패하므로 내부 테스트용으로 낮춰 두었다.
  프로덕션 심사 제출 전에 두 자격 증명을 Secrets Manager에 넣고 `NODE_ENV=production`으로 재배포한다.
- SMS(Twilio), 이메일(Resend) 발송과 FCM 푸시는 실기기 검증 전이다.
- ECS는 VPC 커넥터 없이 퍼블릭 서브넷에서 실행 중이며 RDS 접근은 보안 그룹 참조로 제한했다. Resend와
  FCM을 붙일 때 송신 경로를 다시 점검한다.
- 스토어 스크린샷 14장은 이전 색·서체로 촬영한 것이다. Pretendard와 ember 팔레트 적용 후 재촬영이
  필요하다.
- `../apps/mobile/store-listing/screenshots/final/ko-KR/manifest.json` (제출 빌드와 동일 commit 증빙)은 아직 없다.

## 7. 주의: 폐기된 AAB

**`v5`만 사용한다.** 이전 빌드는 모두 폐기한다.

| 빌드 | 폐기 사유 |
| --- | --- |
| `app-seniorclub.aab`, `-v2`, `-v3` | API URL이 번들에 없다. `getMobileEnvironment()`가 `process.env`를 객체째로 넘겨 Expo의 빌드 타임 치환이 적용되지 않았고, 네이티브 빌드에는 런타임 환경변수가 없으므로 앱이 서버에 접속할 수 없다. |
| `-v4` | API URL은 들어갔으나 서체가 섞인다. `fontWeight`를 직접 쓰는 46곳이 Pretendard 대신 시스템 폰트로 렌더링된다(로그인 화면 다수 포함). |

`v5`에서 확인한 것: 번들에 API/웹 URL 두 개 모두 존재, Pretendard 3종 포함, 패키지 `com.toris.seniorclub`.

## 8. 검증 방법

빌드한 AAB가 실제로 올바른지 확인하려면 압축을 풀어 번들 문자열을 검사한다. 값을 넘겼다는 사실과
번들에 들어갔다는 사실은 다르다. 이 프로젝트에서 실제로 세 개의 빌드가 이 차이 때문에 폐기됐다.

```bash
unzip -q -o build-output/app-seniorclub-v5.aab -d /tmp/aabcheck
strings /tmp/aabcheck/base/assets/index.android.bundle | grep -oE "https://d33totqtaqpyfs\.cloudfront\.net" | sort -u
find /tmp/aabcheck -iname "*Pretendard*"
```
