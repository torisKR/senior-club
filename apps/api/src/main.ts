import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { bootstrap } from "./bootstrap";

const bootstrapLogger = new Logger("Bootstrap");

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  bootstrapLogger.error(message);
  process.exitCode = 1;
});
