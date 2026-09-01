import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  clubPostsParamsSchema,
  type ClubPostsParams,
  commentFeedQuerySchema,
  type CommentFeedQuery,
  commentParamsSchema,
  type CommentParams,
  createCommentSchema,
  type CreateCommentInput,
  createPostSchema,
  type CreatePostInput,
  postFeedQuerySchema,
  type PostFeedQuery,
  postParamsSchema,
  type PostParams,
  updateCommentSchema,
  type UpdateCommentInput,
  updatePostSchema,
  type UpdatePostInput,
} from "./posts.contracts";
import { PostsService } from "./posts.service";

const PUBLIC_FEED_CACHE =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";
const PRIVATE_MUTATION_CACHE = "private, no-store";

@Controller("v1/clubs")
export class ClubPostsController {
  constructor(private readonly posts: PostsService) {}

  @Get(":slug/posts")
  @Header("Cache-Control", PUBLIC_FEED_CACHE)
  list(
    @Param(new ZodValidationPipe(clubPostsParamsSchema))
    params: ClubPostsParams,
    @Query(new ZodValidationPipe(postFeedQuerySchema)) query: PostFeedQuery,
  ) {
    return this.posts.list(params.slug, query);
  }

  @Post(":slug/posts")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  create(
    @Param(new ZodValidationPipe(clubPostsParamsSchema))
    params: ClubPostsParams,
    @Body(new ZodValidationPipe(createPostSchema)) input: CreatePostInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.create(params.slug, input, principal);
  }
}

@Controller("v1/posts")
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get(":id")
  @Header("Cache-Control", PUBLIC_FEED_CACHE)
  detail(
    @Param(new ZodValidationPipe(postParamsSchema)) params: PostParams,
  ) {
    return this.posts.detail(params.id);
  }

  @Get(":id/comments")
  @Header("Cache-Control", PUBLIC_FEED_CACHE)
  comments(
    @Param(new ZodValidationPipe(postParamsSchema)) params: PostParams,
    @Query(new ZodValidationPipe(commentFeedQuerySchema))
    query: CommentFeedQuery,
  ) {
    return this.posts.comments(params.id, query);
  }

  @Post(":id/comments")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  createComment(
    @Param(new ZodValidationPipe(postParamsSchema)) params: PostParams,
    @Body(new ZodValidationPipe(createCommentSchema))
    input: CreateCommentInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.createComment(params.id, input, principal);
  }

  @Patch(":id")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  update(
    @Param(new ZodValidationPipe(postParamsSchema)) params: PostParams,
    @Body(new ZodValidationPipe(updatePostSchema)) input: UpdatePostInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.update(params.id, input, principal);
  }

  @Delete(":id")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  remove(
    @Param(new ZodValidationPipe(postParamsSchema)) params: PostParams,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.remove(params.id, principal);
  }
}

@Controller("v1/comments")
@UseGuards(AccessTokenGuard)
export class CommentsController {
  constructor(private readonly posts: PostsService) {}

  @Patch(":id")
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  update(
    @Param(new ZodValidationPipe(commentParamsSchema)) params: CommentParams,
    @Body(new ZodValidationPipe(updateCommentSchema))
    input: UpdateCommentInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.updateComment(params.id, input, principal);
  }

  @Delete(":id")
  @Header("Cache-Control", PRIVATE_MUTATION_CACHE)
  remove(
    @Param(new ZodValidationPipe(commentParamsSchema)) params: CommentParams,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.posts.removeComment(params.id, principal);
  }
}
