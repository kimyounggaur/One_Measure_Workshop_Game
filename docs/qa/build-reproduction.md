# 새 설치와 빌드 재현

2026-10-19 UTC, Node24.14.0 / npm11.9.0 / Windows10.0.26200. 원본 작업트리와 별도로 상위 `verification-clean` 폴더를 새로 만들고 node_modules/dist/.git/output 및 환경 파일을 제외한 프로젝트 파일을 복사했다. 원본 백업은 수정하지 않았다.

1. `npm ci --no-audit --no-fund` 실제 실행: exit0, 140 packages 설치(약14초). 기존 lockfile 사용, 버전 재선택 없음.
2. `npm run check` 실제 실행: typecheck/lint/unit140/content21/build 모두 exit0.
3. 최종 build identity/라이선스 배포 파일 추가를 반영한 뒤 같은 clean 설치에서 check를 다시 실행: exit0. buildId **c019fa7c2f6a0c59**, 필수 manifest **213파일 / 759,685 bytes**.

설치 확인과 기존 node_modules에서의 build를 혼동하지 않는다. 마지막 재검사에서 재설치할 필요가 있는 의존성/lockfile 변경은 없었다. package-lock SHA256은 `769019d808e8559191a73bdfc06f5185f1e220a65b224eb05cde72cd0247a684`이다.

Windows의 core.autocrlf=true가 원본 자산이나 Linux build 식별을 바꾸지 않도록 .gitattributes에서 일반 소스는 LF, 제공 원문·public/assets는 byte 보존으로 지정했다. hash 입력 상대 경로도 /로 정규화한다. 앱 소스/public/scripts에는 검사 시 CRLF 텍스트가 0개였다. 실제 Vercel Linux의 build-meta와 비교하는 최종 증거는 운영 검증 기록에 별도로 남긴다.

소스/문서/테스트/자산 357파일을 알려진 private-key·GitHub token·OpenAI key·AWS access key·Google API key 패턴으로 검사해 발견0이었다. 이것은 모든 비밀 형식을 탐지한다는 보장이 아니다. 실제 작업에서 인증 파일/환경 파일/사용자 저장소/raw taps를 프로젝트로 복사하지 않았고 output/test-results/node_modules/dist/.vercel/.env는 Git 제외다. 최종 배포물은 Vercel이 Git 소스에서 새로 만든 dist이며 테스트용 브라우저 profile이나 백업 다운로드를 포함하지 않는다.
