export function describeFailure(prefix: string, retryable: boolean, code: string): string {
  return retryable
    ? `${prefix} 잠시 후 다시 시도해 주세요.`
    : `${prefix} 문제가 계속되면 문의해 주세요. (${code})`;
}
