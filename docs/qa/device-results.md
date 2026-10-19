# 실제 기기와 자동 브라우저 결과

확인일 2026-10-19 UTC. 현재 PC에서만 작업했으며 오프라인 DESKTOP-FVHJSEO는 접속하지 않았다. **물리 휴대전화·사람 청취·스크린리더·외부 loopback 측정은 실시하지 않았다.**

| 환경 | 실행 범위 | 결과 |
| --- | --- | --- |
| Windows 10.0.26200, Intel Core i9-11980HK, 논리16 CPU, 메모리68,448,612,352 bytes | Chrome155.0.8059.80 headless, localhost, 실제 시계·IndexedDB·Web Audio·service worker | AUTO_PASS; 직접 사람 조작·청취 아님 |
| Chrome 320/390/768/1280 CSS px, 터치 에뮬레이션 | 단일 pointer 조립·키보드·목록·화면 넘침 | AUTO_PASS; 물리 모바일 아님 |
| Chrome CSS 글자100/200%, light/dark/high-contrast | axe, computed 대비, reflow, focus | AUTO_PASS; OS/browser 실제 zoom·스크린리더 아님 |
| iPhone Safari: 출시 시 정할 현재 주요 iOS | 내장/유선/Bluetooth, 세로/가로 | BLOCKED_DEVICE — 필요하지만 미검증; 버전 추정하지 않음 |
| iPhone Safari: 지원할 이전 주요 iOS | 동일 | BLOCKED_DEVICE |
| iPad Safari, 터치+물리 키보드 | 조립·회전·오디오 | BLOCKED_DEVICE |
| Android Chrome 중급 기기 | 입력·오디오·실제 느린 망 성능 | BLOCKED_DEVICE |
| Android Chrome 저사양 기기 | 동일 | BLOCKED_DEVICE |
| Windows Edge155.0.4283.62 headless | editor13/audio-lifecycle5/recovery4/transfer2/privacy1 | AUTO_PASS 25개; 최초24PASS+privacy 검사 수정 후1PASS |
| Desktop Firefox | 표준 설치 경로에 없음 | NOT_RUN; 추가 설치하지 않음 |
| Desktop Safari | 이 Windows 환경에서 실행 불가 | BLOCKED_DEVICE |
| VoiceOver/Safari, TalkBack/Chrome | focus 순서·기호명·안내·완주 | BLOCKED_DEVICE |

물리 시험은 각 기기의 모델/OS/browser/version/date/앱 commit/출력 경로를 적고 실시한다. L3 쉼, L6 짧은 음과 쉼, N4 대 N2 N2를 실제 듣는다. count-in/음 중간 stop, 다시 시작, background/화면잠금/회전/전화·OS interruption, 출력 변경을 확인한다. 새 run은 새 준비박으로 시작해야 한다. 내장·유선·Bluetooth마다 입력 맞춤의 성공/거부·stale와 결과 안내를 기록한다. 실제 end-to-end 지연을 측정하지 않으면 ms 수치를 만들지 않는다.

저장 공간 제한/브라우저 정리와 실제 비행기 모드도 별도 기록한다. 자동 quota/abort 주입 및 Playwright `setOffline(true)`는 실제 장치 상태를 대신하지 않는다. 지원 기기 목록은 이 시험을 마친 뒤 확정해야 한다.
