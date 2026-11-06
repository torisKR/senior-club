# RDS PITR 복구 QA 런북

대상: `ap-northeast-2` / `senior-club-db`. 실행일: 2026-09-30.

**실제 PITR, migration/catalog baseline 비교, cleanup이 PASS다. 운영 source의 available/private 상태와 backup 7일·deletion protection이 보존됐다.**
시작→metadata proof는 **845.3초**, 시작→cleanup은 **1148.0초(약 19분 8초)**다. 60분·clone 1개 제한을 충족했다. 실제 invoice는 확인하지 않았으며 **$1은 비용 목표이고 billing hard cap이 아니다.**

최종 증거: [database-recovery-live.json](qa-evidence/20260930/database-recovery-live.json). 비교 기준: [운영 catalog baseline](qa-evidence/20260930/database-schema-live.json). 운영 연결 검증: [private/TLS 증거](qa-evidence/20260930/database-private-live.json).

## 1. 실제 실행과 결과

| 항목 | 기록 |
| --- | --- |
| Source / exact target | `senior-club-db` / `senior-club-recovery-202609300727-f4a592` |
| RunId | `f4a5925a8c` |
| RestoreAt | `2026-09-30T07:20:11Z` |
| T0 | `2026-09-30T07:31:54.750694Z` |
| 설정된 종료 기한 | `2026-09-30T08:31:54Z` |
| Clone available 관찰 | `2026-09-30T07:44:37.544037Z` |
| Inspector created / started | `07:45:21.662Z` / `07:45:59.003Z` |
| Proof logged / task STOPPED | `07:46:00.071Z` / `07:46:27.557Z`, container exit 0 |
| Cleanup 확인 | `2026-09-30T07:51:02.704929Z`, `passed=true` |
| Clone 사양 | private, PostgreSQL 18.3, `db.t4g.micro`, gp3 20 GiB, Single-AZ |
| Clone 보안·비용 설정 | encrypted/same KMS, same subnet group, dedicated SG only, retention 0, deletion protection false, PI off, monitoring 0 |
| 연결 proof | TLS 1.3, authorized, hostnameValidated/privateSocket/readOnly/databaseIdentityMatches 모두 true |
| Migration / catalog 비교 | migration 10개·local checksum match, table 35개, invalid constraints/indexes 각각 0; 두 fingerprint·catalogCounts exact baseline match |
| Cleanup 결과 | targetAbsent/ownedGroupsAbsent true, owned snapshots 0, retained backups 0 |
| Source·공용 자원 | source available/private, backup 7일·deletion protection 보존; 공용 production log group 보존; 새 credential 없음 |

`baselineAndRestoredMetadataMatch=true`, `restoredInspector.passed=true`, `cleanup.passed=true`, 최종 `passed=true`를 증거 JSON에서 확인한다.
개별 migration checksum 표와 fingerprint 상세값은 baseline·최종 JSON을 기준으로 관리한다. 여기서 checksum이나 canonicalization을 별도로 재정의하지 않는다.

## 2. 백업 조회 기준

2026-09-30 **07:13:03 UTC**의 read-only 조회에서 자동 스냅샷 **8개**, 수동 **1개**가 모두 available/encrypted였다. 자동 백업은 active, retention 7일, PostgreSQL 18.3/gp3 20 GiB였다.
그 조회의 PITR window는 `2026-09-23T07:06:10Z`부터 `2026-09-30T07:06:10Z`까지다. 이 기록은 조회 시점의 window이며 이후 선택한 restore time의 검증 자료로 재사용하지 않는다.
재사용 시 생성 직전 source의 snapshot/automated-backup window를 읽고 그 안의 UTC restore time을 고정한다. `DescribeDBSnapshots`, `DescribeDBInstanceAutomatedBackups` 출력은 상태·시각·사양만 선택한다.

## 3. 재사용 절차와 고정 reader

1. 새 RunId, exact clone identifier, T0, 60분 deadline과 생성 inventory를 먼저 기록한다. 운영 source identifier는 생성·수정·삭제 대상에서 제외한다.
2. 실행 시점의 local SQL migration checksum과 read-only 운영 catalog baseline을 기존 허용된 ECS 연결 경로에서 고정한다. 동일 reader의 SQL 선택 범위·정렬·정규화·encoding·hash 방식을 유지한다.
3. 같은 VPC·기존 subnet group에서 운영과 동일 engine/class 및 gp3 20 GiB의 encrypted private clone 1개를 PITR로 생성한다. 사양·가격·호환성 확인은 실행 담당이 수행하며 별도 재승인 흐름을 만들지 않는다.
4. clone available 후 exact RunId/identifier, private, encryption/key, 사양, 전용 SG, retention 0, deletion protection false, PI off/monitoring 0을 확인한다.
5. 기존 `senior-club-api:25`를 그대로 one-off `run-task`하고 container command만 아래 계약으로 override한다. 서버/worker를 시작하지 않고 baseline과 같은 compact JS의 host 환경값만 clone으로 바꾼다.
6. task의 실제 terminal `STOPPED`·exit 0과 proof를 수집한다. migration checksum·두 fingerprint·catalogCounts·table count·invalid 상태를 baseline과 비교한 뒤 성공·실패 모두 cleanup한다.

```text
taskDefinition: senior-club-api:25
containerOverrides.command: ["node", "-e", "<동일 compact fixed-reader JS>"]
host override: inventory의 exact clone endpoint
connect timeout: 8000 ms
statement_timeout: 5000 ms
lock_timeout: 1000 ms
transaction: BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY
```

기존 task definition, entryPoint, 신뢰된 이미지, 환경·secret 참조·역할·로그 설정을 재사용한다. task definition 등록·변경·cleanup은 없다. port mapping/health check를 변경한 실행으로 보고하지 않는다.
JS total timer는 없으며 전체 60분 제한은 실행 프로세스의 budget watch가 관리한다. `DEPROVISIONING`이나 container 종료만으로 task terminal을 판정하지 않는다.
이 실행의 [읽기 전용 reader 원본](qa-evidence/20260930/database-catalog-reader.cjs)과 원본·실제 실행 compact code의 SHA-256은 증거 JSON에 보존했다. 원본에는 당시 migration/table 기대값과 `172.31` VPC 범위가 고정돼 있다. 재사용 전에 현재 소스·VPC 범위를 확인하고 기대값을 새로 고정하며, 소스와 복구본 모두 같은 프로그램을 사용한다.
host는 inventory와 일치해야 하며 source host·환경 기본값·localhost로 fallback하지 않는다. 기존 `/app/rds-ca.pem`의 strict CA/hostname 검증을 유지하고 TLS 검증을 해제하지 않는다.
reader는 고정 metadata SELECT와 read-only transaction만 수행한다. DB credential 역할 자체의 권한 축소를 주장하지 않는다. credential/DB URL/raw error/사용자 rows는 로그나 보고서에 출력하지 않는다.

## 4. SG와 변경 범위

| 자원 | 연결 규칙 |
| --- | --- |
| clone SG | inbound TCP 5432: inspector SG에서만; 별도 outbound 없음 |
| inspector SG | inbound 없음; outbound TCP 5432: clone SG로만; TCP 443: any HTTPS |
| 운영 DB SG | inspector 허용 규칙을 추가하지 않으며 inspector에 운영 API SG를 함께 연결하지 않음 |

신규 SG의 기본 all-traffic egress를 제거한다. 기존 VPC/subnet/AWS 전송 경로를 사용하며 운영 SG/route/secret/parameter group을 수정하지 않는다.
443 any HTTPS는 이미지 pull·로그 등 기존 execution 초기화에 사용한다. AWS destination만 허용하는 네트워크라고 주장하지 않는다. reader는 앱/worker 및 외부 provider를 호출하지 않는다.

## 5. Ownership·cleanup 조건

- inventory에는 exact clone identifier/ARN, RunId, 전용 SG 2개, inspector task/ENI의 생성 여부와 ID를 즉시 기록한다. 기존 task definition·공용 로그 그룹·source 자원은 삭제 목록에서 제외한다.
- prefix 또는 태그 하나만으로 삭제하지 않는다. exact inventory와 RunId가 일치하는 이번 run의 자원만 정리한다. source `senior-club-db`는 명시적으로 삭제·수정 대상에서 제외한다.
- API 응답 유실·observation timeout은 동일 identifier/task handle을 재조회해 해소한다. unknown outcome 때문에 두 번째 clone을 생성하지 않는다.
- 성공·실패·취소·deadline 모두 동일한 `finally` cleanup 경로를 따른다. 추가 검사를 deadline 15분 전 중단하고, task STOPPED 및 관련 ENI 해제를 확인한다.
- clone 삭제는 `SkipFinalSnapshot=true`, `DeleteAutomatedBackups=true`를 사용한다. 기존 source snapshot/backup은 보존한다.
- clone이 실제 absent인지 확인한 뒤 전용 SG와 새 SG 내부 참조 규칙만 제거한다. owned snapshot/retained backup이 각각 0인지 확인한다.
- source available/private, backup 7일·deletion protection, 공용 production log group 보존을 확인한다. 기존 secret·credential·KMS key는 변경·삭제하지 않는다.
- 잔존 자원이 있으면 cleanup 완료로 표시하지 않고 exact ID·정리 동작을 기록한다. 단순 stop이나 `deleting` 상태를 삭제 완료로 대신하지 않는다.

이번 실행은 **07:51:02.704929 UTC**에 target absent, owned SG absent, owned snapshot 0, retained backup 0, source 보존을 확인해 cleanup PASS다. 전용 SG 잔존 수는 0이다.
공용 로그 그룹은 삭제하지 않았고 새 credential은 생성하지 않았다. task STOPPED·exit 0 및 cleanup 필드는 최종 증거 JSON을 기준으로 판정한다.

## 6. 최종 결과 검토 기준

| 최종 JSON 항목 | 확인값 |
| --- | --- |
| `baselineAndRestoredMetadataMatch` | true; 두 fingerprint·catalogCounts·migration/table/invalid 상태 일치 |
| `restoredInspector.lastStatus` / container `exitCode` | STOPPED / 0 |
| `restoredInspector.proof.passed` | true; strict TLS·identity·read-only·metadata 조건 충족 |
| `cleanup.targetAbsent` / `ownedGroupsAbsent` | true / true |
| `cleanup.ownedSnapshotCount` / `ownedRetainedBackupCount` | 0 / 0 |
| `cleanup.sourceAvailable` / `sourcePrivate` / `sourceBackupsAndDeletionProtectionPreserved` | 모두 true |
| `cleanup.sharedProductionLogGroupDeleted` / `newCredentialCreated` | false / false |
| `networkScope.productionSecurityGroupsUnchanged` | true |
| `budget.maximumMinutes` / `cloneCount` / `withinElapsedBudget` | 60 / 1 / true |
| `budget.billingHardCap` / `actualInvoiceVerified` | false / false |
| 최상위 `passed` | true |

## 7. 판정 범위와 한계

- 시작→proof **845.3초**, 시작→cleanup **1148.0초**는 이번 절차의 관측 경과 시간이다. 서비스 복구 RTO·RPO·SLA를 보장하지 않는다.
- 60분·clone 1개 제한 충족은 관측했다. `$1` 비용 목표는 invoice로 검증하지 않았고 청구 상한을 강제하지 않았다.
- business rows는 SELECT하지 않았다. 검사 결과는 선택한 migration/catalog metadata의 정확한 일치이며 업무 데이터 내용·정합성·전체 데이터 품질 검증이 아니다.
- Prisma diff, 모든 물리 블록 무결성, lazy loading 완료·운영 성능 회복을 검증한 결과가 아니다.
- 운영 cutover/failback, Multi-AZ failover, cross-region/account DR, 외부 로그인·SMS·푸시·결제, object storage 복구는 수행 범위에 없다.
- 제한된 PITR metadata 비교와 cleanup PASS를 서비스 전체 DR 완료나 production QA 전체 완료로 확대하지 않는다.
