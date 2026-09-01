import type {
  ApplicationActor,
  ApplicationTransitionContext,
  EventApplication,
  EventApplicationStatus,
} from "@/lib/types";

export const APPLICATION_TRANSITIONS: Readonly<
  Record<EventApplicationStatus, readonly EventApplicationStatus[]>
> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled", "attended", "no-show"],
  rejected: [],
  cancelled: [],
  attended: [],
  "no-show": [],
};

const ACTOR_TRANSITIONS: Readonly<
  Record<
    ApplicationActor,
    Readonly<
      Partial<Record<EventApplicationStatus, readonly EventApplicationStatus[]>>
    >
  >
> = {
  member: {
    pending: ["cancelled"],
    approved: ["cancelled"],
  },
  leader: {
    pending: ["approved", "rejected"],
    approved: ["cancelled", "attended", "no-show"],
  },
  admin: APPLICATION_TRANSITIONS,
};

export type ApplicationTransitionErrorCode =
  | "SAME_STATUS"
  | "INVALID_TRANSITION"
  | "FORBIDDEN_ACTOR"
  | "REASON_REQUIRED"
  | "INVALID_TIMESTAMP";

export interface ApplicationTransitionValidation {
  valid: boolean;
  code?: ApplicationTransitionErrorCode;
  message?: string;
}

export class ApplicationTransitionError extends Error {
  constructor(
    public readonly code: ApplicationTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationTransitionError";
  }
}

export function isApplicationTransitionAllowed(
  from: EventApplicationStatus,
  to: EventApplicationStatus,
): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export function canActorTransitionApplication(
  actor: ApplicationActor,
  from: EventApplicationStatus,
  to: EventApplicationStatus,
): boolean {
  return ACTOR_TRANSITIONS[actor][from]?.includes(to) ?? false;
}

export function getAllowedApplicationTransitions(
  status: EventApplicationStatus,
  actor?: ApplicationActor,
): readonly EventApplicationStatus[] {
  if (!actor) {
    return APPLICATION_TRANSITIONS[status];
  }

  return ACTOR_TRANSITIONS[actor][status] ?? [];
}

export function validateApplicationTransition(
  application: EventApplication,
  to: EventApplicationStatus,
  context: ApplicationTransitionContext,
): ApplicationTransitionValidation {
  if (application.status === to) {
    return {
      valid: false,
      code: "SAME_STATUS",
      message: `신청 상태가 이미 '${to}'입니다.`,
    };
  }

  if (!isApplicationTransitionAllowed(application.status, to)) {
    return {
      valid: false,
      code: "INVALID_TRANSITION",
      message: `'${application.status}' 상태에서 '${to}' 상태로 변경할 수 없습니다.`,
    };
  }

  if (
    !canActorTransitionApplication(context.actor, application.status, to)
  ) {
    return {
      valid: false,
      code: "FORBIDDEN_ACTOR",
      message: `'${context.actor}' 권한으로 이 상태를 변경할 수 없습니다.`,
    };
  }

  if (to === "rejected" && !context.reason?.trim()) {
    return {
      valid: false,
      code: "REASON_REQUIRED",
      message: "신청을 거절할 때는 사유를 입력해야 합니다.",
    };
  }

  if (context.now !== undefined && Number.isNaN(Date.parse(context.now))) {
    return {
      valid: false,
      code: "INVALID_TIMESTAMP",
      message: "상태 변경 시각이 올바른 날짜 형식이 아닙니다.",
    };
  }

  return { valid: true };
}

export function canTransitionApplication(
  application: EventApplication,
  to: EventApplicationStatus,
  context: ApplicationTransitionContext,
): boolean {
  return validateApplicationTransition(application, to, context).valid;
}

export function assertApplicationTransition(
  application: EventApplication,
  to: EventApplicationStatus,
  context: ApplicationTransitionContext,
): void {
  const validation = validateApplicationTransition(application, to, context);

  if (!validation.valid) {
    throw new ApplicationTransitionError(
      validation.code ?? "INVALID_TRANSITION",
      validation.message ?? "신청 상태를 변경할 수 없습니다.",
    );
  }
}

/** Applies a validated transition and returns a new application object. */
export function transitionApplication(
  application: EventApplication,
  to: EventApplicationStatus,
  context: ApplicationTransitionContext,
): EventApplication {
  assertApplicationTransition(application, to, context);

  const now = context.now ?? new Date().toISOString();
  const transitioned: EventApplication = {
    ...application,
    status: to,
    updatedAt: now,
  };

  if (to === "approved") {
    transitioned.approvedAt = now;
  }

  if (to === "cancelled") {
    transitioned.cancelledAt = now;
  }

  if (to === "attended") {
    transitioned.attendedAt = now;
  }

  if (to === "rejected") {
    transitioned.rejectedReason = context.reason?.trim();
  }

  return transitioned;
}
