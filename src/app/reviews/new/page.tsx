import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewForm } from "@/components/review-form";
import { requireServerUser } from "@/lib/auth/server";
import { getPublicEvent } from "@/lib/events/server";
import { parseReviewEventId } from "@/lib/reviews/bff";

export const metadata: Metadata = { title: "후기 작성" };

type NewReviewPageProps = {
  searchParams: Promise<{ eventId?: string | string[] }>;
};

export default async function NewReviewPage({ searchParams }: NewReviewPageProps) {
  const { eventId: requestedEventId } = await searchParams;
  const eventId = parseReviewEventId(requestedEventId);
  if (!eventId) notFound();

  await requireServerUser(
    `/reviews/new?eventId=${encodeURIComponent(eventId)}`,
  );
  const reviewEvent = await getPublicEvent(eventId);
  if (!reviewEvent) notFound();

  return (
    <div className="page-container page-content">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">활동을 다음 관계로 이어주세요</p>
        <h1 className="page-title">{reviewEvent.title}은 어떠셨나요?</h1>
        <p className="supporting-copy mt-3">참석한 회원만 후기를 남길 수 있어요. 함께한 분에게 도움이 된 순간을 편하게 적어주세요.</p>
        <ReviewForm eventId={reviewEvent.id} />
      </div>
    </div>
  );
}
