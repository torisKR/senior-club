export type WritingAccess =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "onboarding" }
  | { status: "ready"; userId: string }
  | { status: "error"; message: string };

type ResolvedWritingAccess = Extract<
  WritingAccess,
  { status: "anonymous" | "onboarding" | "ready" }
>;

export function resolveWritingAccess(payload: unknown): ResolvedWritingAccess {
  const session = payload as
    | {
        authenticated?: unknown;
        user?: {
          id?: unknown;
          onboardingCompletedAt?: unknown;
        };
      }
    | null;

  if (session?.authenticated !== true) {
    return { status: "anonymous" };
  }
  if (typeof session.user?.id !== "string") {
    throw new Error("회원 정보를 확인하지 못했습니다.");
  }
  if (typeof session.user.onboardingCompletedAt !== "string") {
    return { status: "onboarding" };
  }
  return { status: "ready", userId: session.user.id };
}
