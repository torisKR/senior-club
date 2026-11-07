# Android 게임 스크린샷

최종 고정 소스의 실제 앱 화면을 캡처한다. 휴대전화는 5~6장, 7인치와 10인치 태블릿은 각각 4~8장의 세로 9:16 PNG가 필요하다. 마을, 파크골프, 알까기, 사천성과 이야기 화면처럼 실제로 접근할 수 있는 내용을 보여 준다.

`manifest.example.json`은 입력 형식의 예시다. 캡처 APK와 각 PNG의 실제 해시·소스 SHA·기기 설정을 기록하고, 여섯 `attestations`는 사람이 원본을 확인한 뒤에만 수정한다. 실제 manifest와 PNG는 고정된 소스의 별도 증거로 보관하며 Git에 커밋하지 않는다.

정확한 발급·전달 계약은 [Play 인수 문서](../../../../docs/PLAY_UPLOAD_HANDOFF.md)에 있다. `pnpm --dir apps/mobile validate:screenshots:release <manifest 경로>`로 형식을 확인할 수 있지만, 자동 검사는 사람의 검토를 대신하지 않는다.
