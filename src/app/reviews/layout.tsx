import type { ReactNode } from "react";

import { PRIVATE_ROUTE_METADATA } from "@/lib/seo";

export const metadata = PRIVATE_ROUTE_METADATA;

export default async function ReviewsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
