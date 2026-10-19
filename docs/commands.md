# 실행 명령

Windows PowerShell에서는 npm.cmd를 사용한다. Node 24.14.0에서 검증한다.

- npm ci
- npm run dev — 127.0.0.1:5386
- npm run typecheck / lint / test:unit / test:content / test:integration
- npm run build
- npm run preview — 127.0.0.1:4386
- npm run test:e2e — production build 이후 로컬 Chrome 자동 테스트
- npm run test:audio — production build 이후 Web Audio 자동 테스트
- npm run check — 현재 연결된 필수 검사

실제 기기나 실제 청취는 이 명령의 통과로 대체되지 않는다. 구현 전 테스트 묶음은 해당 단계 보고에서 NOT_RUN이며 빈 테스트를 성공 처리하지 않는다.
