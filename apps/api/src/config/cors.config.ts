import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

const ALLOWED_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "X-CSRF-Token",
  "X-Request-ID",
] as const;

export function createCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptions {
  const originSet = new Set(allowedOrigins);

  return {
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [...ALLOWED_HEADERS],
    exposedHeaders: ["X-Request-ID"],
    maxAge: 600,
    origin(origin, callback) {
      // Android/iOS native requests generally have no browser Origin header.
      callback(null, origin === undefined || originSet.has(origin));
    },
  };
}

