import {
  Body,
  Controller,
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
  chatMessageListQuerySchema,
  type ChatMessageListQuery,
  chatRoomListQuerySchema,
  type ChatRoomListQuery,
  sendChatMessageSchema,
  type SendChatMessageInput,
} from "./chat.contracts";
import { ChatService } from "./chat.service";

@Controller("v1/chat")
@UseGuards(AccessTokenGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("rooms")
  @Header("Cache-Control", "private, no-store")
  rooms(
    @Query(new ZodValidationPipe(chatRoomListQuerySchema)) query: ChatRoomListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.chat.rooms(query, principal);
  }

  @Get("rooms/:roomId/messages")
  @Header("Cache-Control", "private, no-store")
  messages(
    @Param("roomId") roomId: string,
    @Query(new ZodValidationPipe(chatMessageListQuerySchema)) query: ChatMessageListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.chat.messages(roomId, query, principal);
  }

  @Post("rooms/:roomId/messages")
  @Header("Cache-Control", "private, no-store")
  send(
    @Param("roomId") roomId: string,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) input: SendChatMessageInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.chat.send(roomId, input, principal);
  }

  @Patch("rooms/:roomId/read")
  @Header("Cache-Control", "private, no-store")
  markRead(
    @Param("roomId") roomId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.chat.markRead(roomId, principal);
  }
}
