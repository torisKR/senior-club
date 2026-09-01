import { DynamicModule, Global, Module } from "@nestjs/common";

import type { ApiEnv } from "./env";
import { parseApiEnv } from "./env";

export const API_ENV = Symbol("API_ENV");

@Global()
@Module({})
export class EnvModule {
  static forRoot(input: NodeJS.ProcessEnv = process.env): DynamicModule {
    const env = parseApiEnv(input);

    return {
      global: true,
      module: EnvModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}

export function apiEnvProvider(env: ApiEnv) {
  return { provide: API_ENV, useValue: env } as const;
}
