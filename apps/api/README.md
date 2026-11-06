# 시니어클럽 API

프로덕션 API를 위한 최소 NestJS 스캐폴드다. 현재 제공 범위는 환경 검증,
HTTP 보안 설정, request ID, Prisma PostgreSQL 연결, liveness/readiness다.

## 준비

```bash
cd apps/api
cp .env.example .env
pnpm install
pnpm prisma:generate
```

Prisma Client는 루트 `prisma/schema.prisma` 설정에 따라
`apps/api/src/generated/prisma`에 생성된다. 마이그레이션은 애플리케이션 시작 시 자동
실행하지 않고 배포 release 단계에서 별도로 실행한다.

## 실행

```bash
pnpm dev
```

- `GET /healthz`: 프로세스 liveness, DB를 조회하지 않음
- `GET /readyz`: 제한 시간 내 `SELECT 1` 성공 시 `200`, 실패 시 `503`

프로덕션에서는 `DATABASE_URL`과 `CORS_ORIGINS`를 반드시 배포 환경 변수로
주입한다. `.env` 파일과 데이터베이스 비밀값을 이미지나 저장소에 포함하지 않는다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm typecheck`는 별칭 `@typescript/native`의 TypeScript 7.0.2 네이티브
컴파일러를 실행한다. Nest CLI는 TypeScript의 JavaScript 컴파일러 API가 필요하므로
`pnpm build`, `pnpm start`, `pnpm dev`의 webpack `ts-loader`와 별도 phone credential
컴파일은 TypeScript 6.0.3을 유지한다. 현재 Nest CLI 11.0.24의 webpack
`fork-ts-checker`는 CLI에 포함된 TypeScript 5.9.3을 사용한다. 따라서 Nest 빌드와
TypeScript 7 타입 검사는 둘 다 실행해야 한다.

TypeScript 7.0의 API 제한과 병행 설치 방식은 [TypeScript 7.0 발표][ts7] 및
[Nest CLI 호환성 이슈][nest-ts7]를 참고한다.

[ts7]: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
[nest-ts7]: https://github.com/nestjs/nest-cli/issues/3479
