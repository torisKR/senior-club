import type { ReactNode } from "react";

import { PRIVATE_ROUTE_METADATA } from "@/lib/seo";

export const metadata = PRIVATE_ROUTE_METADATA;

export default function ChatLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
