// Expo introspection must require the launcher and reject unknown exports. The
// legacy Kakao callback is tolerated during the native-plugin transition; the
// compiled manifest gate validates its exact intent contract if it is present.
const requiredExport = 'activity:.MainActivity';
const allowedExports = new Set([
  requiredExport,
  'activity:com.kakao.sdk.auth.AuthCodeHandlerActivity',
]);

export function getExpoExportViolation(keys) {
  if (new Set(keys).size !== keys.length) return '중복된 외부 공개 컴포넌트';
  if (!keys.includes(requiredExport)) return 'MainActivity 외부 공개 누락';
  if (keys.some((key) => !allowedExports.has(key))) return '예상하지 않은 외부 공개 컴포넌트';
  return null;
}
