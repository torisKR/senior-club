import type { Metadata } from "next";

import { createPublicPageMetadata } from "@/lib/seo";

const EVENTS_METADATA = createPublicPageMetadata({
  title: "모임 찾기",
  description:
    "서울과 가까운 지역의 등산, 사진, 역사, 클래식, 원예 등 시니어 모임을 일정·장소·난이도별로 찾아보세요.",
  path: "/events",
});

export function createEventsPageMetadata(hasQueryVariant: boolean): Metadata {
  if (!hasQueryVariant) return EVENTS_METADATA;
  return {
    ...EVENTS_METADATA,
    robots: {
      index: false,
      follow: true,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    },
  };
}
