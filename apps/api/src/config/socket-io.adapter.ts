import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

import type { ApiEnv } from "./env";

export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly env: ApiEnv,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: [...this.env.CORS_ORIGINS],
        credentials: false,
        methods: ["GET", "POST"],
      },
      maxHttpBufferSize: 64 * 1_024,
      perMessageDeflate: false,
    });
  }
}
