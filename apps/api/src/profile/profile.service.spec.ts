import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { UserRole } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { ProfileService } from "./profile.service";

const principal: AuthenticatedPrincipal = {
  userId: "user-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

const input = {
  name: "김영희",
  region: "서울특별시 마포구",
  birthYear: 1962,
  interestSlugs: ["hiking", "photo"],
};

function profileTransaction(options?: {
  activeInterests?: Array<{ id: string; slug: string }>;
  existingUser?: { id: string; onboardingCompletedAt: Date | null } | null;
}) {
  const onboardingCompletedAt = new Date("2026-07-30T01:00:00.000Z");
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options?.existingUser === undefined
          ? { id: principal.userId, onboardingCompletedAt }
          : options.existingUser,
      ),
      update: vi.fn().mockResolvedValue({
        id: principal.userId,
        email: "member@example.com",
        name: input.name,
        birthYear: input.birthYear,
        region: input.region,
        gender: null,
        avatarUrl: null,
        bio: null,
        role: UserRole.MEMBER,
        onboardingCompletedAt,
        interests: [
          {
            interest: {
              id: "interest-hiking",
              slug: "hiking",
              name: "등산",
              icon: "mountain",
              sortOrder: 0,
            },
          },
          {
            interest: {
              id: "interest-photo",
              slug: "photo",
              name: "사진",
              icon: "camera",
              sortOrder: 1,
            },
          },
        ],
        notificationPreference: null,
      }),
    },
    interest: {
      findMany: vi.fn().mockResolvedValue(
        options?.activeInterests ?? [
          { id: "interest-photo", slug: "photo" },
          { id: "interest-hiking", slug: "hiking" },
        ],
      ),
    },
    userInterest: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  return { service: new ProfileService(prisma), transaction };
}

describe("ProfileService", () => {
  it("lists only active interests in stable catalog order", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { interest: { findMany } } as unknown as PrismaService;
    const service = new ProfileService(prisma);

    await expect(service.listInterests()).resolves.toEqual({ data: [] });
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
      },
    });
  });

  it("atomically persists profile fields and the exact active interest set", async () => {
    const { service, transaction } = profileTransaction();

    await expect(service.updateProfile(input, principal)).resolves.toMatchObject({
      id: principal.userId,
      name: input.name,
      birthYear: input.birthYear,
      region: input.region,
      onboardingCompletedAt: "2026-07-30T01:00:00.000Z",
      interests: [
        { id: "interest-hiking", slug: "hiking" },
        { id: "interest-photo", slug: "photo" },
      ],
    });
    expect(transaction.interest.findMany).toHaveBeenCalledWith({
      where: {
        slug: { in: input.interestSlugs },
        isActive: true,
      },
      select: { id: true, slug: true },
    });
    expect(transaction.userInterest.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: principal.userId,
        interestId: {
          notIn: ["interest-hiking", "interest-photo"],
        },
      },
    });
    expect(transaction.userInterest.createMany).toHaveBeenCalledWith({
      data: [
        { userId: principal.userId, interestId: "interest-hiking" },
        { userId: principal.userId, interestId: "interest-photo" },
      ],
      skipDuplicates: true,
    });
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: principal.userId },
        data: expect.objectContaining({
          name: input.name,
          region: input.region,
          birthYear: input.birthYear,
          onboardingCompletedAt: new Date("2026-07-30T01:00:00.000Z"),
        }),
      }),
    );
  });

  it("rejects an unknown or inactive slug before any profile mutation", async () => {
    const { service, transaction } = profileTransaction({
      activeInterests: [{ id: "interest-hiking", slug: "hiking" }],
    });

    await expect(service.updateProfile(input, principal)).rejects.toMatchObject({
      status: 400,
      response: {
        error: {
          code: "INVALID_INTEREST_SELECTION",
          details: { invalidSlugs: ["photo"] },
        },
      },
    });
    expect(transaction.userInterest.deleteMany).not.toHaveBeenCalled();
    expect(transaction.userInterest.createMany).not.toHaveBeenCalled();
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it("returns a stable API error when the authenticated user is gone", async () => {
    const { service, transaction } = profileTransaction({
      existingUser: null,
    });

    await expect(service.updateProfile(input, principal)).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "USER_NOT_FOUND" } },
    });
    expect(transaction.interest.findMany).not.toHaveBeenCalled();
    expect(transaction.userInterest.deleteMany).not.toHaveBeenCalled();
  });
});

