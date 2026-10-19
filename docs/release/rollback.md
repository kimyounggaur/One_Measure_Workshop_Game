# 복귀와 데이터 보존

현재 app1.0.0/document1/content1/DB1은 최초 배포 후보다. **실제 원격 rollback은 실행하지 않았다.** 롤백할 이전 정상 원격 배포가 생긴 뒤 운영자가 그 deployment의 commit/READY/호환성을 확인해야 한다.

업데이트의 일반 흐름은 새 worker가 모든 필수 파일 SHA256을 확인 → waiting → 홈에서 사용자 적용 → 저장 readback 성공 → 오디오 정지 → 활성화/reload다. 새 앱의 일치하는 APP_READY 전에는 호환 이전 cache를 보존하며 installing/waiting 중 old-app ACK가 새 cache를 삭제하지 못한다. cache 정리는 IndexedDB를 삭제하지 않는다.

복귀 전에는 사용자 JSON 백업을 보관하고 현재 schema/content와 복귀 앱의 지원 버전을 비교한다. 동일 schema1이라도 자동으로 모든 미래 필드가 호환된다고 가정하지 않는다. 구버전이 모르는 키·미래 schema 파일은 거부하고 원본 JSON을 그대로 보관한다. import에는 임의 migration이 없다.

현재 raw가 손상되고 정상 previousGood이 있으면 원본 raw를 export하고 명시적으로 이전 저장본을 복구할 수 있다. 복구 transaction은 손상 raw를 metadata의 recovery 키로 남기며 정상 current만 previousGood으로 승격한다. lease/fencing을 잃은 탭은 복구 쓰기도 못 한다. 읽기 전용 탭의 메모리 초안은 별도 export할 수 있다.

미래 DB version이1보다 크면 이 앱으로 강제 downgrade하거나 저장소를 지우지 않는다. 이 버전이 알 수 없는 DB를 자동으로 읽어 정상 작품으로 내보내는 기능은 없다. 해당 미래 버전 앱에서 원본 백업을 내보내고, 호환 복구 도구나 버전을 확보한 뒤 진행한다. current와 previousGood이 모두 손상된 경우 자동 복구 성공을 보장하지 않는다. 브라우저 데이터 삭제는 복구 방법이 아니다.

같은 schema의 이전 배포로 되돌릴 때도 먼저 별도 브라우저/테스트 데이터로 열기·내보내기·새로고침·오프라인·복구를 확인한다. 원격 Git 이력은 보존하고 force push로 되돌리지 않는다. 도메인/프로젝트를 다른 게임에 연결하지 않는다. Vercel의 READY 및 alias 변경은 브라우저에 이미 활성화된 worker까지 즉시 바꾸는 것이 아니므로 기존 탭의 사용자 적용과 실제 build-meta를 확인한다.
