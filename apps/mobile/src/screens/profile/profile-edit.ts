import type { UpdateProfileInput } from '@/api/profile-api-core';
import { normalizeContactPhone } from '@/phone-verification/phone-number';
import type { User } from '@/types/domain';

export function buildContactProfileUpdate(
  edits: { name: string; phoneNumber: string; region: string },
  profile: User,
  interestSlugs: string[],
): UpdateProfileInput {
  const name = edits.name.trim().normalize('NFC').replace(/\s+/gu, ' ');
  const region = edits.region.trim().normalize('NFC').replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 40 || /[<>\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('이름 또는 별명을 2자 이상 40자 이하로 입력해 주세요.');
  }
  if (region.length < 2 || region.length > 80 || /[<>\u0000-\u001f\u007f]/u.test(region)) {
    throw new Error('활동 지역을 2자 이상 80자 이하로 입력해 주세요.');
  }
  if (!profile.birthYear || interestSlugs.length === 0) {
    throw new Error('출생연도와 관심사를 먼저 등록해 주세요. 기존 정보가 확인되지 않아 저장할 수 없어요.');
  }
  return {
    name, region, phoneNumber: normalizeContactPhone(edits.phoneNumber),
    birthYear: profile.birthYear, interestSlugs: [...interestSlugs],
  };
}
