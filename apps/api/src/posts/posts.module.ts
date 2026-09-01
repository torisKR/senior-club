import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import {
  ClubPostsController,
  CommentsController,
  PostsController,
} from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [AuthModule],
  controllers: [ClubPostsController, PostsController, CommentsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
