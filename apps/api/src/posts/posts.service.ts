import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  ClubStatus,
  ContentStatus,
  NotificationType,
  PostType,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CommentFeedQuery,
  CreateCommentInput,
  CreatePostInput,
  PostFeedQuery,
  UpdateCommentInput,
  UpdatePostInput,
} from "./posts.contracts";

type FeedCursor = { createdAt: string; id: string };

const authorSelect = { id: true, name: true } satisfies Prisma.UserSelect;

const postListSelect = {
  id: true,
  clubId: true,
  type: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
  _count: {
    select: { comments: { where: { status: ContentStatus.PUBLISHED } } },
  },
} satisfies Prisma.PostSelect;

const postDetailSelect = {
  ...postListSelect,
  club: {
    select: {
      id: true,
      slug: true,
      title: true,
      region: true,
      interest: { select: { id: true, slug: true, name: true, icon: true } },
    },
  },
} satisfies Prisma.PostSelect;

const commentSelect = {
  id: true,
  postId: true,
  parentId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
} satisfies Prisma.CommentSelect;

type PostListRow = Prisma.PostGetPayload<{ select: typeof postListSelect }>;
type PostDetailRow = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>;
type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function encodeCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FeedCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(parsed.id)
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function invalidCursor(): never {
  throw new ApiException(
    HttpStatus.BAD_REQUEST,
    "INVALID_CURSOR",
    "목록 위치가 올바르지 않습니다.",
  );
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(slug: string, query: PostFeedQuery) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) invalidCursor();

    const club = await this.prisma.club.findFirst({
      where: { slug, status: ClubStatus.ACTIVE },
      select: { id: true, slug: true, title: true },
    });
    if (!club) this.throwClubNotFound();

    const rows = await this.prisma.post.findMany({
      where: {
        clubId: club.id,
        status: ContentStatus.PUBLISHED,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: postListSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      club,
      data: page.map((post) => this.toPostList(post)),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  async detail(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        status: ContentStatus.PUBLISHED,
        club: { status: ClubStatus.ACTIVE },
      },
      select: postDetailSelect,
    });
    if (!post) this.throwPostNotFound();
    return this.toPostDetail(post);
  }

  async comments(postId: string, query: CommentFeedQuery) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) invalidCursor();
    await this.assertPublicPost(postId);

    const rows = await this.prisma.comment.findMany({
      where: {
        postId,
        status: ContentStatus.PUBLISHED,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { gt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: commentSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((comment) => this.toComment(comment)),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  async create(
    slug: string,
    input: CreatePostInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      // The ACTIVE state authorizes the write, so keep the club row locked
      // from the check through the insert.
      await transaction.$queryRaw`
        SELECT "id" FROM "clubs" WHERE "slug" = ${slug} FOR UPDATE
      `;
      const [user, club] = await Promise.all([
        transaction.user.findUnique({
          where: { id: principal.userId },
          select: { id: true, onboardingCompletedAt: true },
        }),
        transaction.club.findFirst({
          where: { slug, status: ClubStatus.ACTIVE },
          select: { id: true },
        }),
      ]);
      this.assertOnboarded(user);
      if (!club) this.throwClubNotFound();

      // MVP policy: until a separate club-join journey exists, every signed-in
      // user who completed onboarding may write in an ACTIVE club. This endpoint
      // does not claim retry idempotency yet; clients must treat a lost create
      // response as ambiguous until a request-key contract is introduced.
      const post = await transaction.post.create({
        data: {
          clubId: club.id,
          userId: principal.userId,
          type: PostType.GENERAL,
          title: input.title,
          content: input.content,
        },
        select: postDetailSelect,
      });
      return this.toPostDetail(post);
    });
  }

  async createComment(
    postId: string,
    input: CreateCommentInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.post.findUnique({
        where: { id: postId },
        select: { clubId: true },
      });
      if (!target) this.throwPostNotFound();

      // Lock in the same stable club -> post -> optional parent order, then
      // re-read every fact that authorizes this comment before inserting it.
      await transaction.$queryRaw`
        SELECT "id" FROM "clubs" WHERE "id" = ${target.clubId} FOR UPDATE
      `;
      await transaction.$queryRaw`
        SELECT "id" FROM "posts" WHERE "id" = ${postId} FOR UPDATE
      `;

      const [user, post] = await Promise.all([
        transaction.user.findUnique({
          where: { id: principal.userId },
          select: { id: true, onboardingCompletedAt: true },
        }),
        transaction.post.findFirst({
          where: {
            id: postId,
            clubId: target.clubId,
            status: ContentStatus.PUBLISHED,
            club: { status: ClubStatus.ACTIVE },
          },
          select: {
            id: true,
            userId: true,
            club: { select: { id: true, slug: true } },
          },
        }),
      ]);
      this.assertOnboarded(user);
      if (!post) this.throwPostNotFound();

      let parent: { id: string; userId: string } | null = null;
      if (input.parentId) {
        await transaction.$queryRaw`
          SELECT "id" FROM "comments" WHERE "id" = ${input.parentId} FOR UPDATE
        `;
        parent = await transaction.comment.findFirst({
          where: {
            id: input.parentId,
            postId,
            parentId: null,
            status: ContentStatus.PUBLISHED,
          },
          select: { id: true, userId: true },
        });
        if (!parent) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_COMMENT_PARENT",
            "같은 게시글의 최상위 댓글에만 답글을 작성할 수 있습니다.",
          );
        }
      }

      const comment = await transaction.comment.create({
        data: {
          postId,
          userId: principal.userId,
          content: input.content,
          parentId: input.parentId ?? null,
        },
        select: commentSelect,
      });

      const recipientId = parent?.userId ?? post.userId;
      if (recipientId !== principal.userId) {
        await transaction.notification.create({
          data: {
            recipientId,
            actorId: principal.userId,
            type: parent ? NotificationType.REPLY : NotificationType.COMMENT,
            title: parent
              ? "내 댓글에 새 답글이 달렸어요"
              : "내 게시글에 새 댓글이 달렸어요",
            body: input.content.slice(0, 120),
            link: `/clubs/${post.club.slug}/posts/${postId}`,
          },
        });
      }

      // FCM/email delivery is intentionally not queued here: comment delivery
      // has no preference/outbox contract yet. The in-app notification is
      // atomic with the comment and can be delivered later without data loss.
      return this.toComment(comment);
    });
  }

  async update(
    postId: string,
    input: UpdatePostInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.post.updateMany({
        where: {
          id: postId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          club: { status: ClubStatus.ACTIVE },
        },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.content === undefined ? {} : { content: input.content }),
        },
      });
      if (updated.count === 0) this.throwPostNotFound();

      const post = await transaction.post.findFirst({
        where: {
          id: postId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          club: { status: ClubStatus.ACTIVE },
        },
        select: postDetailSelect,
      });
      if (!post) this.throwPostNotFound();
      return this.toPostDetail(post);
    });
  }

  async remove(postId: string, principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.post.updateMany({
        where: {
          id: postId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          club: { status: ClubStatus.ACTIVE },
        },
        data: { status: ContentStatus.HIDDEN },
      });
      if (updated.count === 0) this.throwPostNotFound();

      const post = await transaction.post.findUnique({
        where: { id: postId },
        select: { id: true, status: true, updatedAt: true },
      });
      if (!post || post.status !== ContentStatus.HIDDEN) {
        this.throwPostNotFound();
      }
      return {
        id: post.id,
        status: post.status,
        updatedAt: post.updatedAt.toISOString(),
      };
    });
  }

  async updateComment(
    commentId: string,
    input: UpdateCommentInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.comment.updateMany({
        where: {
          id: commentId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          post: {
            status: ContentStatus.PUBLISHED,
            club: { status: ClubStatus.ACTIVE },
          },
        },
        data: { content: input.content },
      });
      if (updated.count === 0) this.throwCommentNotFound();

      const comment = await transaction.comment.findFirst({
        where: {
          id: commentId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          post: {
            status: ContentStatus.PUBLISHED,
            club: { status: ClubStatus.ACTIVE },
          },
        },
        select: commentSelect,
      });
      if (!comment) this.throwCommentNotFound();
      return this.toComment(comment);
    });
  }

  async removeComment(
    commentId: string,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.comment.updateMany({
        where: {
          id: commentId,
          userId: principal.userId,
          status: ContentStatus.PUBLISHED,
          post: {
            status: ContentStatus.PUBLISHED,
            club: { status: ClubStatus.ACTIVE },
          },
        },
        data: { status: ContentStatus.HIDDEN },
      });
      if (updated.count === 0) this.throwCommentNotFound();

      const comment = await transaction.comment.findUnique({
        where: { id: commentId },
        select: { id: true, status: true, updatedAt: true },
      });
      if (!comment || comment.status !== ContentStatus.HIDDEN) {
        this.throwCommentNotFound();
      }
      return {
        id: comment.id,
        status: comment.status,
        updatedAt: comment.updatedAt.toISOString(),
      };
    });
  }

  private async assertPublicPost(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        status: ContentStatus.PUBLISHED,
        club: { status: ClubStatus.ACTIVE },
      },
      select: { id: true },
    });
    if (!post) this.throwPostNotFound();
  }

  private assertOnboarded(
    user: { id: string; onboardingCompletedAt: Date | null } | null,
  ) {
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "USER_NOT_FOUND",
        "회원 정보를 찾을 수 없습니다.",
      );
    }
    if (!user.onboardingCompletedAt) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "ONBOARDING_REQUIRED",
        "관심사와 활동 지역을 설정한 뒤 작성할 수 있습니다.",
      );
    }
  }

  private throwClubNotFound(): never {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      "CLUB_NOT_FOUND",
      "커뮤니티를 찾을 수 없습니다.",
    );
  }

  private throwPostNotFound(): never {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      "POST_NOT_FOUND",
      "게시글을 찾을 수 없습니다.",
    );
  }

  private throwCommentNotFound(): never {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      "COMMENT_NOT_FOUND",
      "댓글을 찾을 수 없습니다.",
    );
  }

  private toPostList(post: PostListRow) {
    return {
      id: post.id,
      clubId: post.clubId,
      type: post.type,
      title: post.title,
      content: post.content,
      author: post.author,
      commentCount: post._count.comments,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private toPostDetail(post: PostDetailRow) {
    return {
      ...this.toPostList(post),
      club: post.club,
    };
  }

  private toComment(comment: CommentRow) {
    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      content: comment.content,
      author: comment.author,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
