# Android 배포 이력

아래는 2026년 커뮤니티 앱의 Android 후보 및 검증 이력이다. 현재 게임의 빌드나 Play 공개 증거가 아니며, 현재 릴리스 절차는 [.github/DEPLOYMENT.md](../.github/DEPLOYMENT.md)를 따른다. 이전 웹/API 배포 기록은 Git `8201a93:docs/DEPLOYMENT.md`에 남아 있다.

## Android 배포와 QA

ADB 재검사 기기: Galaxy M33, Android 16. 실제 운영 API를 사용하는 standalone release-mode QA APK를 설치했다. QA APK는 기존 기기의 데이터를 보존하기 위해 debug certificate로 서명했다. Play upload/signing artifact나 production AAB로 취급하지 않는다.

앞선 Android 디자인 소스 `0d91c27…`의 실제 설치 QA APK는 `8d117e63324d4de82c4550f2c2ced5e283a528704b07459bec80b7ae2014bad5`다. 기본 글자·하단 탐색·사진 slot과 6개 확대 조합을 실기기에서 검사했고 큰 글씨/시스템 설정을 복구했다. [실기기 증거와 범위](QA_PRODUCTION_20260930.md).

추가 상태 표시줄 수정 source `9a9825b…`의 새 QA APK `3fa88a…`는 같은 QA 서명과 build/manifest/
실제 설치 해시를 확인했다. 기기에 다른 앱이 foreground여서 스크롤 재검사는 중단됐다.
[새 APK의 검증 한계](qa-evidence/20260930/native-scroll-inset-candidate.json).

이 디자인을 포함한 소스 `9a9825b32ae47f5abcfdbbc2af1b8f7103cabecd`에서 로컬 upload-signed AAB 후보를
생성했다. `0.1.1` / `212215980`, 4 ABI, 93,679,910 bytes이며 SHA-256은
`968066c227bf77dfa7ba210cbdd7b3d310c5daa5c2e189514a60543f104086e0`다. pinned bundletool·전체 서명·
compiled manifest·production 설정·동일 사진/Material font를 확인했다.
[정확한 후보 증거](qa-evidence/20260930/android-scroll-inset-signed-candidate.json).
이후 증거/문서 변경은 후보의 전체 SHA에 포함되지 않는다. 해당 AAB 설치·provider 로그인·
Play version 대조·최종 screenshot 검토·hosted CI·Play 업로드는 아직 수행하지 않았다.

릴리스는 `apps/mobile/scripts/release-android-preflight.mjs`와 최종 스크린샷 provenance gate를 통과한 후 Android App Bundle의 package/versionCode/target36, upload 및 Play signing, **병합 manifest**를 검사한다. Expo introspection은 SDK manifest merge 결과까지 검사하지 않는다. 미서명/QA APK를 스토어에 제출하지 않는다.

현재 main 배포 workflow의 Android 호출은 `submit_to_play:false`다. binary 생성과 Play 공개는 별개다. Play 제출 전에 실제 최종 서명 AAB·Firebase certificate·정책/Data Safety·결제/푸시 검증·스크린샷을 마무리한다.

마지막 실행 소스 `1babf95…`의 전체 로컬 preflight는 자산/Material navigation·production config·과거 후보 PNG
규격을 통과했으나 `/privacy`의 공급자 처리정보 미확정 문구와 최종 screenshot manifest 부재로
실패했다(2/5 단계). API readiness·약관·계정 삭제 endpoint는 통과했다.
[현재 release preflight 증거](qa-evidence/20260930/android-release-preflight.json).
내부 release wrapper에도 필수 screenshot run ID와 `actions: read`를 전달하도록 수정했다.
이 검사 결과를 아래 운영 수용 조건 전체의 완료로 해석하지 않는다.

추가 인증 수정 source `948c232…`의 APK `d0c861…`와 AAB `0a1a15…`는 로컬 build/서명/
manifest/번들 검증이 통과했다. 기기 인수 없이 새 APK를 설치하지 않았다. 앞선 `3fa88a…` 설치와
`968066…` AAB가 새 인증 회귀 수정의 runtime 증거는 아니다.
[현재 후보와 검증 구분](QA_PRODUCTION_20260930.md#추가-모바일-인증-회귀-수정).
