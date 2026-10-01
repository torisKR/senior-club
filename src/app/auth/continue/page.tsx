import { SessionContinuation } from "@/components/session-continuation";
import { continuationDestination } from "@/lib/auth/continue-destination";

export default async function ContinuePage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const value = (await searchParams).returnTo;
  return (
    <main id="main-content" className="flex min-h-[60vh] items-center bg-[var(--canvas)] px-5 py-12 text-[var(--ink)]">
      <SessionContinuation returnTo={continuationDestination(typeof value === "string" ? value : null)} />
    </main>
  );
}
