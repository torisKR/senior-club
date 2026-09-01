import { EVENTS, INTERESTS, getInterestLabel } from "@/lib/data";
import type {
  Event,
  EventRecommendation,
  InterestId,
  RecommendationOptions,
  RecommendationScore,
  UserProfile,
} from "@/lib/types";

const MAX_RELATED_INTEREST_SCORE = 10;
const RELATED_INTEREST_SCORE = 5;

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function normalizeRegion(value: string): string {
  return normalizeText(value).replace(
    /(특별자치시|특별자치도|특별시|광역시|도)$/u,
    "",
  );
}

function resolveInterest(value: string): InterestId | undefined {
  const normalized = normalizeText(value);
  return INTERESTS.find(
    (interest) =>
      normalizeText(interest.id) === normalized ||
      normalizeText(interest.label) === normalized,
  )?.id;
}

function selectedInterests(user: UserProfile): Set<InterestId> {
  const ids = user.interests
    .map(resolveInterest)
    .filter((interest): interest is InterestId => interest !== undefined);

  return new Set(ids);
}

function scoreInterests(
  event: Event,
  userInterests: Set<InterestId>,
): Pick<RecommendationScore, "breakdown" | "reasons"> {
  let score = 0;
  const reasons: string[] = [];

  if (userInterests.has(event.category)) {
    score += 40;
    reasons.push(`${getInterestLabel(event.category)} 관심사와 잘 맞아요`);
  }

  const relatedMatches = event.relatedInterests.filter((interest) =>
    userInterests.has(interest),
  );
  const relatedScore = Math.min(
    relatedMatches.length * RELATED_INTEREST_SCORE,
    MAX_RELATED_INTEREST_SCORE,
  );

  if (relatedScore > 0) {
    score += relatedScore;
    const labels = relatedMatches
      .slice(0, 2)
      .map(getInterestLabel)
      .join("·");
    reasons.push(`${labels} 관심사와도 이어져요`);
  }

  return {
    breakdown: { interest: score, region: 0, history: 0 },
    reasons,
  };
}

function scoreRegion(event: Event, user: UserProfile): {
  score: number;
  reason?: string;
} {
  const normalizedDistrict = normalizeText(event.district);
  const userDistrict = user.district ? normalizeText(user.district) : "";
  const regionContainsDistrict = normalizeText(user.region).includes(
    normalizedDistrict,
  );

  if (
    normalizedDistrict.length > 0 &&
    (userDistrict === normalizedDistrict || regionContainsDistrict)
  ) {
    return {
      score: 30,
      reason: `${event.district}에서 열려 이동이 편해요`,
    };
  }

  if (normalizeRegion(user.region) === normalizeRegion(event.region)) {
    return {
      score: 20,
      reason: `같은 ${event.region} 지역의 모임이에요`,
    };
  }

  return { score: 0 };
}

function scoreHistory(event: Event, user: UserProfile): {
  score: number;
  reasons: string[];
} {
  const attended = (user.participationHistory ?? []).filter(
    (record) => record.status === "attended",
  );
  const sameClub = attended.some((record) => record.clubId === event.clubId);
  const sameCategory = attended.some(
    (record) => record.category === event.category,
  );
  const reasons: string[] = [];
  let score = 0;

  if (sameClub) {
    score += 12;
    reasons.push("전에 함께한 모임이라 익숙해요");
  }

  if (sameCategory) {
    score += 8;
    reasons.push(`참여했던 ${getInterestLabel(event.category)} 활동과 비슷해요`);
  }

  return { score, reasons };
}

/**
 * Scores only the three MVP signals promised to users. Keeping the components
 * explicit makes recommendation copy explainable and lets future weights be
 * changed without silently changing the profile model.
 */
export function scoreEventRecommendation(
  event: Event,
  user: UserProfile,
): RecommendationScore {
  const interestResult = scoreInterests(event, selectedInterests(user));
  const regionResult = scoreRegion(event, user);
  const historyResult = scoreHistory(event, user);
  const breakdown = {
    interest: interestResult.breakdown.interest,
    region: regionResult.score,
    history: historyResult.score,
  };

  return {
    score: breakdown.interest + breakdown.region + breakdown.history,
    breakdown,
    reasons: [
      ...interestResult.reasons,
      ...(regionResult.reason ? [regionResult.reason] : []),
      ...historyResult.reasons,
    ],
  };
}

export function recommendEvents(
  user: UserProfile,
  events: readonly Event[] = EVENTS,
  options: RecommendationOptions = {},
): EventRecommendation[] {
  const {
    limit = 6,
    includeUnavailable = false,
    excludeApplied = true,
  } = options;
  const appliedEventIds = new Set(user.appliedEventIds ?? []);
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 6;

  return events
    .filter((event) => {
      if (
        !includeUnavailable &&
        (event.status !== "recruiting" ||
          event.participantCount >= event.capacity)
      ) {
        return false;
      }

      return !excludeApplied || !appliedEventIds.has(event.id);
    })
    .map((event) => ({
      event,
      ...scoreEventRecommendation(event, user),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.event.startAt.localeCompare(right.event.startAt) ||
        left.event.id.localeCompare(right.event.id),
    )
    .slice(0, normalizedLimit);
}
