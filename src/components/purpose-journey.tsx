import {
  CalendarHeart,
  Compass,
  HeartHandshake,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type PurposeJourneyStep = "purpose" | "people" | "activity" | "relationship";

type PurposeJourneyProps = {
  currentStep?: PurposeJourneyStep;
  className?: string;
};

const JOURNEY: Array<{
  id: PurposeJourneyStep;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "purpose",
    label: "목적",
    description: "관심을 고르고",
    icon: Compass,
  },
  {
    id: "people",
    label: "사람",
    description: "마음 맞는 사람을 만나고",
    icon: UsersRound,
  },
  {
    id: "activity",
    label: "활동",
    description: "모임을 함께하고",
    icon: CalendarHeart,
  },
  {
    id: "relationship",
    label: "관계",
    description: "다음 약속으로 이어져요",
    icon: HeartHandshake,
  },
];

export function PurposeJourney({
  currentStep = "purpose",
  className = "",
}: PurposeJourneyProps) {
  const currentIndex = JOURNEY.findIndex((step) => step.id === currentStep);

  return (
    <nav
      aria-label="시니어클럽 활동 여정"
      className={`overflow-hidden rounded-[1.4rem] border border-[var(--line)] bg-white shadow-[0_14px_38px_rgba(20,52,46,0.08)] ${className}`}
    >
      <ol className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
        {JOURNEY.map((step, index) => {
          const Icon = step.icon;
          const isCurrent = index === currentIndex;
          const isReached = index <= currentIndex;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={`relative flex min-h-28 items-center gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0 ${
                isCurrent ? "bg-[var(--sky-soft)]" : "bg-white"
              }`}
              key={step.id}
            >
              <span
                aria-hidden="true"
                className={`grid size-12 shrink-0 place-items-center rounded-full border-2 ${
                  isReached
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--line)] bg-[var(--canvas)] text-[var(--muted)]"
                }`}
              >
                <Icon size={24} strokeWidth={2.3} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <strong className="text-lg font-black tracking-[-0.02em]">
                    {step.label}
                  </strong>
                  {isCurrent ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-[var(--primary-strong)]">
                      지금
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm font-semibold leading-snug text-[var(--muted)]">
                  {step.description}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
