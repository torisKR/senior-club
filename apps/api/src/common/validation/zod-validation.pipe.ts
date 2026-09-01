import { HttpStatus, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { ApiException } from "../http/api.exception";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "INVALID_REQUEST",
      "입력 내용을 다시 확인해 주세요.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
}
