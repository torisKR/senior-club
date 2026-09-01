import { HttpStatus } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { TokenService } from "../auth/token.service";
import { ApiException } from "../common/http/api.exception";
import { UserStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  joinChatRoomSchema,
  socketSendMessageSchema,
} from "./chat.contracts";
import { ChatService } from "./chat.service";

type AuthenticatedSocket = Socket & {
  data: { auth?: AuthenticatedPrincipal };
};

@WebSocketGateway({ namespace: "/chat", transports: ["websocket"] })
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string") throw new Error("Missing token");
        const principal = await this.tokens.verifyAccessToken(token);
        const session = await this.prisma.authSession.findUnique({
          where: { id: principal.sessionId },
          select: {
            userId: true,
            revokedAt: true,
            expiresAt: true,
            user: { select: { role: true, status: true } },
          },
        });
        if (
          !session ||
          session.userId !== principal.userId ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.user.status !== UserStatus.ACTIVE
        ) throw new Error("Inactive session");
        socket.data.auth = { ...principal, role: session.user.role };
        next();
      } catch {
        next(new Error("AUTHENTICATION_REQUIRED"));
      }
    });
  }

  @SubscribeMessage("room:join")
  async join(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    const input = joinChatRoomSchema.safeParse(body);
    const principal = this.principal(socket);
    if (!input.success) throw new WsException("INVALID_REQUEST");
    try {
      await this.assertActiveSession(principal);
      await this.chat.assertMembership(input.data.roomId, principal);
      await socket.join(`room:${input.data.roomId}`);
      return { ok: true, roomId: input.data.roomId };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage("message:send")
  async send(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    const input = socketSendMessageSchema.safeParse(body);
    const principal = this.principal(socket);
    if (!input.success) throw new WsException("INVALID_REQUEST");
    try {
      await this.assertActiveSession(principal);
      const { roomId, ...messageInput } = input.data;
      const message = await this.chat.send(roomId, messageInput, principal);
      await this.emitToAuthorizedRoom(roomId, principal.userId, message);
      return { ok: true, message };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  private principal(socket: AuthenticatedSocket) {
    if (!socket.data.auth) throw new WsException("AUTHENTICATION_REQUIRED");
    return socket.data.auth;
  }

  private async assertActiveSession(principal: AuthenticatedPrincipal) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: UserStatus.ACTIVE },
      },
      select: { id: true },
    });
    if (!session) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_REQUIRED",
        "로그인이 만료되었습니다.",
      );
    }
  }

  private async emitToAuthorizedRoom(
    roomId: string,
    senderId: string,
    message: unknown,
  ) {
    const roomName = `room:${roomId}`;
    const sockets = await this.server.in(roomName).fetchSockets();
    if (sockets.length === 0) return;

    const principals = sockets.map(
      (socket) =>
        (socket.data as { auth?: AuthenticatedPrincipal }).auth ?? null,
    );
    const sessionIds = [
      ...new Set(
        principals
          .map((principal) => principal?.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
      ),
    ];
    const socketUserIds = [
      ...new Set(
        principals
          .map((principal) => principal?.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    const [entitledMemberIds, activeSessions, blockedInteractionUserIds] =
      await Promise.all([
      this.chat.entitledMemberIds(roomId),
      this.prisma.authSession.findMany({
        where: {
          id: { in: sessionIds },
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: UserStatus.ACTIVE },
        },
        select: { id: true, userId: true },
      }),
      this.chat.blockedInteractionUserIds(senderId, socketUserIds),
    ]);
    const activeSessionUsers = new Map(
      activeSessions.map((session) => [session.id, session.userId]),
    );

    await Promise.all(
      sockets.map(async (socket, index) => {
        const principal = principals[index];
        const hasActiveSession =
          principal &&
          activeSessionUsers.get(principal.sessionId) === principal.userId;
        if (
          !principal ||
          !hasActiveSession ||
          !entitledMemberIds.has(principal.userId)
        ) {
          await socket.leave(roomName);
          return;
        }
        if (blockedInteractionUserIds.has(principal.userId)) return;
        socket.emit("message:new", message);
      }),
    );
  }

  private toWsException(error: unknown) {
    if (error instanceof ApiException) {
      const response = error.getResponse() as { error?: { code?: string } };
      return new WsException(response.error?.code ?? "CHAT_REQUEST_FAILED");
    }
    return new WsException("CHAT_REQUEST_FAILED");
  }
}
