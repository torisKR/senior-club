/** Dynamic route parameters must be singular; duplicate query/path values fail closed. */
export function strictSingleRouteParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}
