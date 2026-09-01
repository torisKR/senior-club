import "reflect-metadata";
import "dotenv/config";

import { type INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./common/http/request-id.middleware";
import { createCorsOptions } from "./config/cors.config";
import type { ApiEnv } from "./config/env";
import { API_ENV } from "./config/env.module";
import { ConfiguredIoAdapter } from "./config/socket-io.adapter";

const bootstrapLogger = new Logger("Bootstrap");

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<ApiEnv>(API_ENV);

  // Security middleware must be installed before Nest registers routes.
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.enableCors(createCorsOptions(env.CORS_ORIGINS));
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, env));
  app.enableShutdownHooks();

  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const env = app.get<ApiEnv>(API_ENV);

  await app.listen(env.PORT, "0.0.0.0");
  bootstrapLogger.log(`API listening on port ${env.PORT}`);
}
