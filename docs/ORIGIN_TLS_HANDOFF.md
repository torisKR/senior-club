# CloudFront → ALB HTTPS

## 2026-10-01 전환 완료

CloudFront 배포가 `Deployed`인 상태에서 API 원본을 `api.aws-origin.senior.toris.kr`와 `https-only`, origin TLS 1.2로 전환했다. `/readyz` HTTPS canary가 database `ok`를 반환한 뒤 전체 경로를 전환했고 canary를 제거했다. `/healthz`, `/readyz`, 인증 없는 `/v1/me`, 차단된 전화 로그인 경계를 확인한 뒤 ALB의 80 ingress를 제거했다.

현재 DNS는 다음과 같다. 모두 TTL Auto이며 CNAME은 DNS only다.

| Type | Name | Value |
| --- | --- | --- |
| CAA | aws-origin.senior.toris.kr | `0 issue "amazon.com"` |
| CNAME | api.aws-origin.senior.toris.kr | senior-club-alb-1510403427.ap-northeast-2.elb.amazonaws.com |
| CNAME | _83cb79fd3e642abd30fecff640410669.api.aws-origin.senior.toris.kr | _4b3cf0af31f2eac1d3de44eaac3ab8aa.wzccmgtwzk.acm-validations.aws |

발급·사용 중인 서울 리전 non-exportable ACM 인증서 ID는 `5063e53e-90f6-4316-9933-23f7eeba8124`이며 SAN은 새 원본 hostname과 일치한다. ALB 443은 `ELBSecurityPolicy-TLS13-1-2-2021-06`, 기본 응답 403과 기존 secret-header forward rule을 사용한다. CloudFront origin-facing prefix list만 443으로 허용한다. prefix list의 규칙 가중치 때문에 기존 80 그룹과 별도의 HTTPS 전용 보안 그룹을 사용했으며 새 그룹은 outbound 권한을 추가하지 않는다. 기존 ALB 그룹의 outbound 경로는 보존했다.

기존 `origin.senior.toris.kr` 인증서 요청은 `CAA_ERROR`로 종료됐다. 루트 CAA와 기존 웹 DNS를 바꾸지 않고 Amazon 발급이 허용된 원본 전용 하위 영역을 만들어 해결했다. 아래 9월 30일 요청과 DNS는 이전 준비 기록이며 현재 활성 원본이나 인증서로 사용하지 않는다. 실패한 인증서를 재사용하지 않는다. 새 검증 CNAME은 자동 갱신을 위해 유지한다.

운영 설정이나 rollback 파일에 있는 origin secret을 로그·문서·저장소에 기록하지 않는다. 이후 변경도 fresh ETag, 현재 설정 보존, HTTPS readiness canary, 배포 완료 확인 순서로 진행한다. HTTP rollback이 필요하면 보존된 설정과 기존 CloudFront 전용 ingress를 먼저 복구하고, 정상 경로를 확인한 뒤 cleanup한다.

## 이전 준비 기록 — 2026-09-30

2026-09-30 현재 API는 정상이다. 아래 DNS 등록은 기존 웹 senior.toris.kr의 레코드를 바꾸지 않는다. CloudFront의 origin 전용 hostname을 준비한다.

## Cloudflare DNS 등록

toris.kr zone에 아래 두 CNAME을 등록한다. 둘 다 **DNS only / proxied=false**다. ACM 검증 CNAME은 인증서 자동 갱신을 위해 유지한다.

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | _44963d706ca14f80f48f26f046db8532.origin.senior | _53f5e1bb78189ea80b3e65c36e3ed2ad.wzccmgtwzk.acm-validations.aws | DNS only |
| CNAME | origin.senior | senior-club-alb-1510403427.ap-northeast-2.elb.amazonaws.com | DNS only |

같은 hostname에 다른 A/AAAA/CNAME이 이미 있으면 먼저 충돌과 사용처를 확인한다. 현재 공개 DNS 조회에는 위 origin 레코드가 없었다. CLI 인증으로 zone 조회는 가능했지만 DNS 조회는 403 / authentication error였다. Cloudflare 관리 페이지의 계정 로그인 또는 승인된 DNS 권한이 필요하다. 비밀번호·API token을 채팅이나 저장소에 넣지 않는다.

## AWS 적용 순서

서울 리전 ap-northeast-2에서 non-exportable public ACM certificate를 이미 요청했다. 같은 인증서를 재사용하며 요청을 반복하지 않는다.

- Domain: origin.senior.toris.kr
- Certificate ID: 9adb8f06-5412-4fb3-862d-9a44b7edfbb6
- 관찰 상태: PENDING_VALIDATION
- Export: DISABLED

1. 실제 DNS 응답과 ACM ISSUED 상태를 확인한다. 인증서의 SAN에 origin hostname이 있어야 한다.
2. 기존 HTTP listener·CloudFront configuration·SG를 비공개 rollback 파일로 보존한다. origin secret은 로그·보고서에 기록하지 않는다.
3. ALB 443 HTTPS listener에 발급된 인증서와 TLS 1.2/1.3 policy를 적용한다. 기본 응답 403과 기존 secret header 기반 forward rule을 동일하게 유지한다. 443 ingress도 CloudFront origin-facing prefix list만 허용한다.
4. 별도 HTTPS origin과 /readyz behavior를 먼저 구성해 CloudFront 경유의 TLS handshake와 database readiness를 검증한다. 인증서 오류를 무시하거나 일시적으로 public ingress를 열지 않는다.
5. canary가 200 / database ok이고 CloudFront가 Deployed이면 기존 API origin도 이 hostname과 https-only로 바꾼다. TLS 1.2만 origin protocol로 허용한다. header와 request/cache policies는 보존한다.
6. CloudFront 배포 완료 후 health/readiness·카카오 및 차단된 로그인·보호 API·오류 로그를 확인한다. 검증된 뒤 임시 behavior/origin을 정리하고 기존 80 ingress를 제거한다.

실패 시 fresh ETag와 보존된 configuration으로 직전 정상 CloudFront origin을 복구한다. 정상 트래픽이 확인되기 전에 HTTP 경로를 제거하지 않는다. 최종 HTTPS 성공·80 차단이 관찰되기 전까지 전환 완료로 보고하지 않는다.

CloudFront는 origin hostname과 인증서 이름이 일치해야 한다. [AWS HTTPS origin 지침](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html), [ALB HTTPS listener 지침](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html).
