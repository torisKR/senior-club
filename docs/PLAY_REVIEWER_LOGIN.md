# Google Play 앱 심사 계정

일반 회원은 카카오 로그인을 사용한다. Android 로그인 화면의 `심사 계정으로 로그인`은
개인 카카오 계정을 공유하지 않고 Play 심사자가 같은 회원 기능에 접근하기 위한 별도 인증 경로다.
가입·비밀번호 재설정·관리자 로그인 기능을 제공하지 않는다.

Firebase Authentication의 Email/Password로 발급한 전용 앱 계정만 사용한다. API의
`AUTH_REVIEWER_FIREBASE_UID`에 해당 UID를 지정하고 기존 `FIREBASE_PROJECT_ID` 및
ECS WIF 권한을 유지한다. 설정이 없으면 경로는 닫힌다. 클라이언트에는 UID·비밀번호를 넣지 않는다.

앱은 비밀번호로 Firebase에 로그인해 새 ID 토큰을 얻고 임시 Firebase 로그인을 정리한 뒤
`POST /v1/auth/reviewer`에 토큰·Android clientType·필수 동의를 보낸다. API는 SDK로 서명,
프로젝트, 만료, 계정 비활성화 및 토큰 철회를 확인한다. 지정 UID, password 제공자,
이메일 identity 및 5분 이내의 실제 로그인도 확인한다. 다른 Firebase 사용자나 custom/phone/
Google 토큰으로 앱 회원을 만들 수 없다. Firebase의 비밀번호 시도 제한에 더해 API 인스턴스마다
토큰 교환 요청을 분당 60회로 제한한다. 이 추가 제한은 분산 rate limiter가 아니다.

전용 identity는 기존 EMAIL provider의 `firebase-reviewer:<UID>` 이름공간으로 기록한다.
동시 로그인은 PostgreSQL transaction advisory lock으로 하나의 MEMBER 계정을 만든다.
기존 이메일 회원과 이메일 주소로 자동 연결하지 않는다. 프로필 설정·동의 기록·세션 저장·갱신·
로그아웃·탈퇴·회원 기능은 기존 경로를 사용한다. 관리자/리더로 바뀐 계정은 새 로그인과 갱신을
거절한다. 서명된 reviewer 세션 제한을 HTTP 및 채팅 인증에도 적용해 기존 세션이 관리자 권한을
얻지 못하게 한다. 이 identity나 비밀번호는 API 응답에 포함하지 않는다.

비밀번호는 Play Console의 앱 액세스에만 등록하고 보호된 로컬 인수 파일로 보관한다.
채팅, Git, 공개 로그·사진, 앱 설정에는 넣지 않는다. 비밀번호 회전 및 Firebase token revocation은
새 로그인 proof를 무효화한다. 이미 발급된 앱 세션을 즉시 막으려면 해당 앱 회원을 SUSPENDED로
바꾸거나 해당 회원의 AuthSession을 철회한다. 일반 회원과 관리자 자격 증명은 변경하지 않는다.

Play Console 앱 액세스의 영어 안내는 실제 설치·로그인 검증 후 다음 절차에 맞춘다.

> Open the app. Accept the required Terms of Service and Privacy Policy checkboxes.
> Tap “심사 계정으로 로그인” (Review account sign-in). Enter the app review email and
> password provided in this entry, then tap “심사 계정 로그인 확인” (Confirm review account sign-in).
> This is a Senior Club app review account; do not use the Kakao button for this account.
> Complete the profile setup if prompted. Phone verification and usage analytics are optional.
> The account can access the same member features as regular users. No OTP or personal Kakao account is required.

위 안내는 실제 UI 문구와 테스트 결과에 맞춰 수정하고 저장 후 다시 열어 확인한다.
실제 Firebase 로그인·API 교환·앱 재시작 복구·프로필 및 회원 권한 QA를 완료하기 전에는
접근 가능하다고 인증하지 않는다. 스토어 최종 화면은 고정 소스의 새 서명 APK에서 캡처한다.

[Google Play 심사 접근 안내](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-GB),
[Firebase ID token 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[카카오 계정 약관](https://www.kakao.com/policy/kakaoTerms?type=s&version=simple).
