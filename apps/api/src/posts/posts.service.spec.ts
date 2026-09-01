import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  ClubStatus,
  ContentStatus,
  NotificationType,
  PostType,
  UserRole,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import {
  commentFeedQuerySchema,
  createCommentSchema,
  createPostSchema,
  postFeedQuerySchema,
} from "./posts.contracts";
import { PostsService } from "./posts.service";

const principal: AuthenticatedPrincipal = {
  userId: "member-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};
const createdAt = new Date("2026-07-29T09:00:00.000Z");
const updatedAt = new Date("2026-07-29T10:00:00.000Z");

function postRow(id = "post-1") {
  return {
    id,
    clubId: "club-1",
    type: PostType.GENERAL,
    title: "다음 산책 준비물",
    content: "다음 산책에 필요한 준비물을 함께 확인합니다.",
    createdAt,
    updatedAt,
    author: { id: "member-1", name: "김정희" },
    _count: { comments: 2 },
  };
}

function detailRow(id = "post-1") {
  return {
    ...postRow(id),
    club: {
      id: "club-1",
      slug: "forest-walkers",
      title: "숲길을 걷는 사람들",
      region: "서울특별시",
      interest: {
        id: "interest-1",
        slug: "hiking",
        name: "등산",
        icon: "mountain",
      },
    },
  };
}

function commentRow(id = "comment-1", parentId: string | null = null) {
  return {
    id,
    postId: "post-1",
    parentId,
    content: "함께 준비하면 좋겠습니다.",
    createdAt,
    updatedAt,
    author: { id: "member-1", name: "김정희" },
  };
}

describe("PostsService public reads", () => {
  it("lists only published posts in an active club with a stable projection", async () => {
    const rows = [postRow("post-3"), postRow("post-2"), postRow("post-1")];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = {
      club: {
        findFirst: vi.fn().mockResolvedValue({
          id: "club-1",
          slug: "forest-walkers",
          title: "숲길을 걷는 사람들",
        }),
      },
      post: { findMany },
    } as unknown as PrismaService;

    const result = await new PostsService(prisma).list(
      "forest-walkers",
      postFeedQuerySchema.parse({ limit: 2 }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { clubId: "club-1", status: ContentStatus.PUBLISHED },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: expect.objectContaining({
        id: true,
        title: true,
        content: true,
        author: { select: { id: true, name: true } },
        _count: {
          select: {
            comments: { where: { status: ContentStatus.PUBLISHED } },
          },
        },
      }),
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: "post-3",
      commentCount: 2,
      createdAt: createdAt.toISOString(),
    });
    expect(result.data[0]).not.toHaveProperty("_count");
    expect(result.page).toEqual({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });
  });

  it("rejects malformed post cursors before querying the feed", async () => {
    const findMany = vi.fn();
    const service = new PostsService({
      club: { findFirst: vi.fn() },
      post: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.list(
        "forest-walkers",
        postFeedQuerySchema.parse({ cursor: "not-valid" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("hides non-public posts and inactive clubs behind one 404", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new PostsService({
      post: { findFirst },
    } as unknown as PrismaService);

    await expect(service.detail("post-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "post-1",
        status: ContentStatus.PUBLISHED,
        club: { status: ClubStatus.ACTIVE },
      },
      select: expect.any(Object),
    });
  });

  it("returns public comments oldest-first with an ascending cursor", async () => {
    const cursorDate = new Date("2026-07-28T09:00:00.000Z");
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: cursorDate.toISOString(), id: "comment-9" }),
      "utf8",
    ).toString("base64url");
    const findMany = vi.fn().mockResolvedValue([commentRow()]);
    const service = new PostsService({
      post: { findFirst: vi.fn().mockResolvedValue({ id: "post-1" }) },
      comment: { findMany },
    } as unknown as PrismaService);

    const result = await service.comments(
      "post-1",
      commentFeedQuerySchema.parse({ cursor }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        postId: "post-1",
        status: ContentStatus.PUBLISHED,
        OR: [
          { createdAt: { gt: cursorDate } },
          { createdAt: cursorDate, id: { gt: "comment-9" } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 21,
      select: expect.any(Object),
    });
    expect(result.data[0]).toMatchObject({
      id: "comment-1",
      parentId: null,
    });
  });
});

describe("PostsService write policy", () => {
  it("allows an onboarded user to create in an active club without a membership lookup", async () => {
    const create = vi.fn().mockResolvedValue(detailRow("post-new"));
    const raw = vi.fn().mockResolvedValue([{ id: "club-1" }]);
    const transaction = {
      $queryRaw: raw,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      club: { findFirst: vi.fn().mockResolvedValue({ id: "club-1" }) },
      post: { create },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService;
    const input = createPostSchema.parse({
      title: "새 산책 이야기",
      content: "함께 걷고 싶은 산책길 이야기를 자세히 나눕니다.",
    });

    const result = await new PostsService(prisma).create(
      "forest-walkers",
      input,
      principal,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        clubId: "club-1",
        userId: principal.userId,
        type: PostType.GENERAL,
        title: input.title,
        content: input.content,
      },
      select: expect.any(Object),
    });
    expect(prisma).not.toHaveProperty("clubMember");
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0]!,
    );
    expect(result).toMatchObject({ id: "post-new", club: { id: "club-1" } });
  });

  it("requires onboarding before creating a post", async () => {
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "club-1" }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: null,
        }),
      },
      club: { findFirst: vi.fn().mockResolvedValue({ id: "club-1" }) },
      post: { create },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.create(
        "forest-walkers",
        createPostSchema.parse({
          title: "작성할 글",
          content: "온보딩 뒤에만 작성할 수 있는 게시글입니다.",
        }),
        principal,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: { code: "ONBOARDING_REQUIRED" } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rechecks ACTIVE club state while holding its row lock", async () => {
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "club-1" }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      club: { findFirst: vi.fn().mockResolvedValue(null) },
      post: { create },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.create(
        "forest-walkers",
        createPostSchema.parse({
          title: "보관된 커뮤니티의 글",
          content: "상태가 바뀐 뒤에는 이 게시글이 저장되면 안 됩니다.",
        }),
        principal,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not claim idempotency for repeated post create requests", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(detailRow("post-first"))
      .mockResolvedValueOnce(detailRow("post-second"));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "club-1" }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      club: { findFirst: vi.fn().mockResolvedValue({ id: "club-1" }) },
      post: { create },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PostsService(prisma);
    const input = createPostSchema.parse({
      title: "응답이 유실된 글",
      content: "요청 키 계약 전에는 재시도가 중복 글을 만들 수 있습니다.",
    });

    const first = await service.create("forest-walkers", input, principal);
    const second = await service.create("forest-walkers", input, principal);

    expect([first.id, second.id]).toEqual(["post-first", "post-second"]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("creates a root comment and its in-app notification in one locked transaction", async () => {
    const raw = vi.fn().mockResolvedValue([{ id: "post-1" }]);
    const create = vi.fn().mockResolvedValue(commentRow());
    const notify = vi.fn().mockResolvedValue({ id: "notification-1" });
    const transaction = {
      $queryRaw: raw,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      post: {
        findUnique: vi.fn().mockResolvedValue({ clubId: "club-1" }),
        findFirst: vi.fn().mockResolvedValue({
          id: "post-1",
          userId: "post-author",
          club: { id: "club-1", slug: "forest-walkers" },
        }),
      },
      comment: { findFirst: vi.fn(), create },
      notification: { create: notify },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService;
    const input = createCommentSchema.parse({
      content: "게시글 작성자에게 알릴 최상위 댓글입니다.",
    });

    await expect(
      new PostsService(prisma).createComment("post-1", input, principal),
    ).resolves.toMatchObject({ id: "comment-1", parentId: null });

    expect(raw).toHaveBeenCalledTimes(2);
    expect(String.raw(raw.mock.calls[0]![0] as TemplateStringsArray)).toContain(
      'FROM "clubs"',
    );
    expect(String.raw(raw.mock.calls[1]![0] as TemplateStringsArray)).toContain(
      'FROM "posts"',
    );
    expect(create).toHaveBeenCalledWith({
      data: {
        postId: "post-1",
        userId: principal.userId,
        content: input.content,
        parentId: null,
      },
      select: expect.any(Object),
    });
    expect(notify).toHaveBeenCalledWith({
      data: {
        recipientId: "post-author",
        actorId: principal.userId,
        type: NotificationType.COMMENT,
        title: "내 게시글에 새 댓글이 달렸어요",
        body: input.content,
        link: "/clubs/forest-walkers/posts/post-1",
      },
    });
    expect(raw.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0]!,
    );

    transaction.post.findFirst.mockResolvedValueOnce(null);
    await expect(
      new PostsService(prisma).createComment("post-1", input, principal),
    ).rejects.toMatchObject({ status: 404 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("locks and rechecks a same-post root before creating a reply notification", async () => {
    const raw = vi.fn().mockResolvedValue([{ id: "row" }]);
    const parentFind = vi
      .fn()
      .mockResolvedValue({ id: "comment-root", userId: "parent-author" });
    const create = vi
      .fn()
      .mockResolvedValue(commentRow("comment-reply", "comment-root"));
    const notify = vi.fn().mockResolvedValue({ id: "notification-1" });
    const transaction = {
      $queryRaw: raw,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      post: {
        findUnique: vi.fn().mockResolvedValue({ clubId: "club-1" }),
        findFirst: vi.fn().mockResolvedValue({
          id: "post-1",
          userId: "post-author",
          club: { id: "club-1", slug: "forest-walkers" },
        }),
      },
      comment: { findFirst: parentFind, create },
      notification: { create: notify },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);
    const input = createCommentSchema.parse({
      content: "최상위 댓글에 남기는 답글입니다.",
      parentId: "comment-root",
    });

    await expect(
      service.createComment("post-1", input, principal),
    ).resolves.toMatchObject({ parentId: "comment-root" });
    expect(raw).toHaveBeenCalledTimes(3);
    expect(String.raw(raw.mock.calls[0]![0] as TemplateStringsArray)).toContain(
      'FROM "clubs"',
    );
    expect(String.raw(raw.mock.calls[1]![0] as TemplateStringsArray)).toContain(
      'FROM "posts"',
    );
    expect(String.raw(raw.mock.calls[2]![0] as TemplateStringsArray)).toContain(
      'FROM "comments"',
    );
    expect(parentFind).toHaveBeenCalledWith({
      where: {
        id: "comment-root",
        postId: "post-1",
        parentId: null,
        status: ContentStatus.PUBLISHED,
      },
      select: { id: true, userId: true },
    });
    expect(notify).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: "parent-author",
        type: NotificationType.REPLY,
        link: "/clubs/forest-walkers/posts/post-1",
      }),
    });

    parentFind.mockResolvedValueOnce(null);
    await expect(
      service.createComment("post-1", input, principal),
    ).rejects.toMatchObject({ status: 400 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("suppresses self-notifications", async () => {
    const notify = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "post-1" }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: principal.userId,
          onboardingCompletedAt: new Date(),
        }),
      },
      post: {
        findUnique: vi.fn().mockResolvedValue({ clubId: "club-1" }),
        findFirst: vi.fn().mockResolvedValue({
          id: "post-1",
          userId: principal.userId,
          club: { id: "club-1", slug: "forest-walkers" },
        }),
      },
      comment: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue(commentRow()),
      },
      notification: { create: notify },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);

    await service.createComment(
      "post-1",
      createCommentSchema.parse({ content: "내 게시글에 직접 남긴 댓글입니다." }),
      principal,
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("soft-hides only an author's still-published post and comment", async () => {
    const postUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const commentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      post: {
        updateMany: postUpdateMany,
        findUnique: vi.fn().mockResolvedValue({
          id: "post-1",
          status: ContentStatus.HIDDEN,
          updatedAt,
        }),
      },
      comment: {
        updateMany: commentUpdateMany,
        findUnique: vi.fn().mockResolvedValue({
          id: "comment-1",
          status: ContentStatus.HIDDEN,
          updatedAt,
        }),
      },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);

    await expect(service.remove("post-1", principal)).resolves.toMatchObject({
      status: ContentStatus.HIDDEN,
    });
    await expect(
      service.removeComment("comment-1", principal),
    ).resolves.toMatchObject({ status: ContentStatus.HIDDEN });
    expect(postUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "post-1",
        userId: principal.userId,
        status: ContentStatus.PUBLISHED,
        club: { status: ClubStatus.ACTIVE },
      },
      data: { status: ContentStatus.HIDDEN },
    });
    expect(commentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "comment-1",
        userId: principal.userId,
        status: ContentStatus.PUBLISHED,
        post: {
          status: ContentStatus.PUBLISHED,
          club: { status: ClubStatus.ACTIVE },
        },
      },
      data: { status: ContentStatus.HIDDEN },
    });
  });

  it("returns 404 when a conditional author mutation loses the race", async () => {
    const transaction = {
      post: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn(),
      },
    };
    const service = new PostsService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.update(
        "post-1",
        { title: "경합 후에는 수정되지 않을 제목" },
        principal,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(transaction.post.findFirst).not.toHaveBeenCalled();
  });
});
