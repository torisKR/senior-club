import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApprovalMode,
  AttendanceStatus,
  ClubMemberRole,
  ClubMemberStatus,
  ConsentDocumentType,
  EventDifficulty,
  EventMemberStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  UserRole,
} from "../apps/api/src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const DAY_MS = 24 * 60 * 60 * 1_000;

function atRelativeDay(days: number, hour: number, minute = 0) {
  const value = new Date(Date.now() + days * DAY_MS);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

async function seed() {
  const interests = [
    ["interest-hiking", "hiking", "등산", "mountain"],
    ["interest-photo", "photo", "사진", "camera"],
    ["interest-history", "history", "역사", "landmark"],
    ["interest-classical", "classical", "클래식", "music"],
    ["interest-gardening", "gardening", "원예", "sprout"],
    ["interest-rail", "rail-travel", "철도여행", "train"],
    ["interest-food", "food", "맛집", "utensils"],
    ["interest-volunteer", "volunteer", "봉사", "heart-handshake"],
    ["interest-english", "english", "영어", "languages"],
    ["interest-reading", "reading", "독서", "book-open"],
  ] as const;

  for (const [id, slug, name, icon] of interests) {
    await prisma.interest.upsert({
      where: { id },
      update: { slug, name, icon, isActive: true },
      create: { id, slug, name, icon, sortOrder: interests.findIndex((entry) => entry[0] === id) },
    });
  }

  const member = await prisma.user.upsert({
    where: { email: "reviewer@seniorclub.kr" },
    update: {
      name: "박영희",
      birthYear: 1962,
      region: "서울특별시 마포구",
      role: UserRole.MEMBER,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
    create: {
      id: "seed-user-member",
      email: "reviewer@seniorclub.kr",
      name: "박영희",
      birthYear: 1962,
      region: "서울특별시 마포구",
      role: UserRole.MEMBER,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      termsAgreedAt: new Date(),
    },
  });

  const leader = await prisma.user.upsert({
    where: { email: "leader@seniorclub.kr" },
    update: { name: "김선영", role: UserRole.LEADER, emailVerifiedAt: new Date() },
    create: {
      id: "seed-user-leader",
      email: "leader@seniorclub.kr",
      name: "김선영",
      birthYear: 1958,
      region: "서울특별시 성동구",
      role: UserRole.LEADER,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      termsAgreedAt: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@seniorclub.kr" },
    update: { name: "시니어클럽 관리자", role: UserRole.ADMIN, emailVerifiedAt: new Date() },
    create: {
      id: "seed-user-admin",
      email: "admin@seniorclub.kr",
      name: "시니어클럽 관리자",
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      termsAgreedAt: new Date(),
    },
  });

  for (const interestId of ["interest-hiking", "interest-photo", "interest-history"]) {
    await prisma.userInterest.upsert({
      where: { userId_interestId: { userId: member.id, interestId } },
      update: {},
      create: { userId: member.id, interestId },
    });
  }

  for (const documentType of [ConsentDocumentType.TERMS, ConsentDocumentType.PRIVACY]) {
    await prisma.consentRecord.upsert({
      where: {
        userId_documentType_version: {
          userId: member.id,
          documentType,
          version: "2026-07-01",
        },
      },
      update: { granted: true, withdrawnAt: null },
      create: {
        userId: member.id,
        documentType,
        version: "2026-07-01",
        granted: true,
        source: "seed",
      },
    });
  }

  await prisma.notificationPreference.upsert({
    where: { userId: member.id },
    update: {},
    create: { userId: member.id, emailEventUpdates: true },
  });

  const hikingClub = await prisma.club.upsert({
    where: { slug: "slow-hiking" },
    update: { leaderId: leader.id, title: "천천히 걷는 산길" },
    create: {
      id: "seed-club-hiking",
      interestId: "interest-hiking",
      leaderId: leader.id,
      slug: "slow-hiking",
      title: "천천히 걷는 산길",
      description: "속도보다 풍경과 대화를 즐기는 안전한 걷기 모임입니다.",
      region: "서울특별시",
    },
  });

  const photoClub = await prisma.club.upsert({
    where: { slug: "phone-photo-walk" },
    update: { leaderId: leader.id, title: "스마트폰 사진산책" },
    create: {
      id: "seed-club-photo",
      interestId: "interest-photo",
      leaderId: leader.id,
      slug: "phone-photo-walk",
      title: "스마트폰 사진산책",
      description: "가까운 공원을 걸으며 스마트폰 사진을 배우고 나눕니다.",
      region: "서울특별시",
    },
  });

  for (const [clubId, userId, role] of [
    [hikingClub.id, leader.id, ClubMemberRole.LEADER],
    [photoClub.id, leader.id, ClubMemberRole.LEADER],
    [hikingClub.id, member.id, ClubMemberRole.MEMBER],
    [photoClub.id, member.id, ClubMemberRole.MEMBER],
  ] as const) {
    await prisma.clubMember.upsert({
      where: { clubId_userId: { clubId, userId } },
      update: { role, status: ClubMemberStatus.ACTIVE },
      create: { clubId, userId, role, status: ClubMemberStatus.ACTIVE, joinedAt: new Date() },
    });
  }

  const events = [
    {
      id: "event-bukhansan-dullegil",
      clubId: hikingClub.id,
      title: "북한산 둘레길, 숲 천천히 걷기",
      description: "완만한 둘레길을 걸으며 계절 풍경과 이야기를 나눕니다.",
      locationName: "북한산 둘레길 안내소",
      address: "서울특별시 은평구 진관동",
      startAt: atRelativeDay(5, 1),
      endAt: atRelativeDay(5, 4),
      capacity: 12,
      price: 10_000,
      difficulty: EventDifficulty.EASY,
      approvalMode: ApprovalMode.MANUAL,
    },
    {
      id: "event-seoulforest-photo",
      clubId: photoClub.id,
      title: "서울숲 오후 빛 사진산책",
      description: "스마트폰 카메라로 빛과 나무를 담고 함께 사진을 봅니다.",
      locationName: "서울숲 방문자센터",
      address: "서울특별시 성동구 뚝섬로 273",
      startAt: atRelativeDay(8, 6),
      endAt: atRelativeDay(8, 9),
      capacity: 10,
      price: 8_000,
      difficulty: EventDifficulty.EASY,
      approvalMode: ApprovalMode.MANUAL,
    },
    {
      id: "event-spring-photo-archive",
      clubId: hikingClub.id,
      title: "경의선 숲길 이야기 산책",
      description: "옛 철길의 역사와 동네 이야기를 들으며 걸었습니다.",
      locationName: "경의선숲길 공덕역 입구",
      address: "서울특별시 마포구 백범로",
      startAt: atRelativeDay(-7, 1),
      endAt: atRelativeDay(-7, 4),
      capacity: 14,
      price: 5_000,
      difficulty: EventDifficulty.EASY,
      approvalMode: ApprovalMode.AUTO,
    },
  ] as const;

  for (const event of events) {
    await prisma.event.upsert({
      where: { id: event.id },
      update: {
        ...event,
        creatorId: leader.id,
        status: event.id === "event-spring-photo-archive" ? EventStatus.COMPLETED : EventStatus.PUBLISHED,
      },
      create: {
        ...event,
        creatorId: leader.id,
        currency: "KRW",
        supplies: "편한 신발, 물, 개인 상비약",
        status: event.id === "event-spring-photo-archive" ? EventStatus.COMPLETED : EventStatus.PUBLISHED,
      },
    });
  }

  const participationStates = [
    ["event-bukhansan-dullegil", EventMemberStatus.PENDING, AttendanceStatus.NOT_CHECKED],
    ["event-seoulforest-photo", EventMemberStatus.APPROVED, AttendanceStatus.NOT_CHECKED],
    ["event-spring-photo-archive", EventMemberStatus.APPROVED, AttendanceStatus.ATTENDED],
  ] as const;

  for (const [eventId, status, attendance] of participationStates) {
    await prisma.eventMember.upsert({
      where: { eventId_userId: { eventId, userId: member.id } },
      update: {
        status,
        attendance,
        reviewedById: status === EventMemberStatus.PENDING ? null : leader.id,
        decidedAt: status === EventMemberStatus.PENDING ? null : new Date(),
        checkedInById: attendance === AttendanceStatus.ATTENDED ? leader.id : null,
        checkedInAt: attendance === AttendanceStatus.ATTENDED ? new Date() : null,
      },
      create: {
        eventId,
        userId: member.id,
        status,
        attendance,
        reviewedById: status === EventMemberStatus.PENDING ? null : leader.id,
        decidedAt: status === EventMemberStatus.PENDING ? null : new Date(),
        checkedInById: attendance === AttendanceStatus.ATTENDED ? leader.id : null,
        checkedInAt: attendance === AttendanceStatus.ATTENDED ? new Date() : null,
      },
    });
  }

  const room = await prisma.chatRoom.upsert({
    where: { id: "seed-room-approved" },
    update: { eventId: "event-seoulforest-photo" },
    create: { id: "seed-room-approved", eventId: "event-seoulforest-photo" },
  });

  for (const userId of [member.id, leader.id]) {
    await prisma.chatRoomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: { leftAt: null },
      create: { roomId: room.id, userId },
    });
  }

  await prisma.chatMessage.upsert({
    where: { id: "seed-message-welcome" },
    update: { message: "반갑습니다. 모임 전날 준비물을 다시 안내드릴게요." },
    create: {
      id: "seed-message-welcome",
      roomId: room.id,
      userId: leader.id,
      clientMessageId: "seed-welcome",
      message: "반갑습니다. 모임 전날 준비물을 다시 안내드릴게요.",
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-approved" },
    update: { readAt: null },
    create: {
      id: "seed-notification-approved",
      recipientId: member.id,
      actorId: leader.id,
      type: NotificationType.APPLICATION_APPROVED,
      title: "모임 신청이 승인됐어요",
      body: "서울숲 오후 빛 사진산책 채팅방에서 준비물을 확인해 주세요.",
      link: "/chat/seed-room-approved",
    },
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
