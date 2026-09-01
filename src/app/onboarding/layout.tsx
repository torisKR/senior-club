import type { ReactNode } from "react";

import { PRIVATE_ROUTE_METADATA } from "@/lib/seo";
import { requireServerUser } from "@/lib/auth/server";

export const metadata = PRIVATE_ROUTE_METADATA;

export default async function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireServerUser("/onboarding");
  return children;
}
