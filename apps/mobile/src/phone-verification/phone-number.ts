export function normalizeContactPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!compact) return null;
  if (/^\+[1-9]\d{9,14}$/.test(compact)) return compact;
  if (/^01[016789]\d{7,8}$/.test(compact)) return `+82${compact.slice(1)}`;
  throw new Error('휴대폰 번호를 010-1234-5678 또는 국가번호를 포함한 형식으로 입력해 주세요.');
}

export function samePhoneNumber(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  try {
    return normalizeContactPhone(left) === normalizeContactPhone(right);
  } catch {
    return false;
  }
}

export function hasVerifiedPhone(profile: {
  phoneNumber?: string | null;
  phoneVerifiedAt?: string | null;
}) {
  return Boolean(
    profile.phoneNumber && profile.phoneVerifiedAt && Number.isFinite(Date.parse(profile.phoneVerifiedAt)),
  );
}
