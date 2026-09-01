import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateProfileInput } from "./profile.contracts";

const interestSelect = {
  id: true,
  slug: true,
  name: true,
  icon: true,
  sortOrder: true,
} satisfies Prisma.InterestSelect;

const profileSelect = {
  id: true,
  email: true,
  phoneNumber: true,
  name: true,
  birthYear: true,
  region: true,
  gender: true,
  avatarUrl: true,
  bio: true,
  role: true,
  onboardingCompletedAt: true,
  interests: {
    select: { interest: { select: interestSelect } },
    orderBy: { selectedAt: "asc" },
  },
  notificationPreference: true,
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async listInterests() {
    const interests = await this.prisma.interest.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: interestSelect,
    });
    return { data: interests };
  }

  async updateProfile(
    input: UpdateProfileInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { id: principal.userId },
        select: { id: true, onboardingCompletedAt: true },
      });
      if (!existingUser) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "USER_NOT_FOUND",
          "회원 정보를 찾을 수 없습니다.",
        );
      }

      const activeInterests = await transaction.interest.findMany({
        where: {
          slug: { in: input.interestSlugs },
          isActive: true,
        },
        select: { id: true, slug: true },
      });
      const activeSlugs = new Set(activeInterests.map(({ slug }) => slug));
      const invalidSlugs = input.interestSlugs.filter(
        (slug) => !activeSlugs.has(slug),
      );
      if (invalidSlugs.length > 0) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INVALID_INTEREST_SELECTION",
          "선택할 수 없는 관심사가 포함되어 있습니다.",
          { invalidSlugs },
        );
      }

      const interestIdsBySlug = new Map(
        activeInterests.map(({ id, slug }) => [slug, id]),
      );
      const interestIds = input.interestSlugs.map(
        (slug) => interestIdsBySlug.get(slug)!,
      );

      await transaction.userInterest.deleteMany({
        where: {
          userId: principal.userId,
          interestId: { notIn: interestIds },
        },
      });
      await transaction.userInterest.createMany({
        data: interestIds.map((interestId) => ({
          userId: principal.userId,
          interestId,
        })),
        skipDuplicates: true,
      });

      const profile = await transaction.user.update({
        where: { id: principal.userId },
        data: {
          name: input.name,
          region: input.region,
          birthYear: input.birthYear,
          onboardingCompletedAt:
            existingUser.onboardingCompletedAt ?? new Date(),
        },
        select: profileSelect,
      });

      return this.toProfileResponse(profile);
    });
  }

  private toProfileResponse(profile: ProfileRow) {
    return {
      ...profile,
      email: profile.email ?? "",
      onboardingCompletedAt:
        profile.onboardingCompletedAt?.toISOString() ?? null,
      interests: profile.interests.map(({ interest }) => interest),
    };
  }
}
