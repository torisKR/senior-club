import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type RequestWithId = Request & { requestId: string };

export function resolveRequestId(
  header: string | readonly string[] | undefined,
): string {
  const candidate = typeof header === "string" ? header : header?.[0];
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  (request as RequestWithId).requestId = requestId;
  response.setHeader("X-Request-ID", requestId);
  next();
}
