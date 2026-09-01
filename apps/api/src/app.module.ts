import { Module } from "@nestjs/common";

import { AccountModule } from "./account/account.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { ClubsModule } from "./clubs/clubs.module";
import { EnvModule } from "./config/env.module";
import { DevicesModule } from "./devices/devices.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OutboxModule } from "./outbox/outbox.module";
import { PostsModule } from "./posts/posts.module";
import { ProfileModule } from "./profile/profile.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { SafetyModule } from "./safety/safety.module";

@Module({
  imports: [
    EnvModule.forRoot(),
    PrismaModule,
    HealthModule,
    AccountModule,
    DevicesModule,
    AuthModule,
    ChatModule,
    ClubsModule,
    EventsModule,
    NotificationsModule,
    ProfileModule,
    PostsModule,
    ReviewsModule,
    SafetyModule,
    OutboxModule,
  ],
})
export class AppModule {}
