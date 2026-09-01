import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ConfiguredEmailSender, EMAIL_SENDER } from "./email.sender";
import { OutboxWorker } from "./outbox.worker";
import { FirebasePushSender, PUSH_SENDER } from "./push.sender";
import { ConfiguredSmsSender, SMS_SENDER } from "./sms.sender";

@Module({
  imports: [AuthModule],
  providers: [
    ConfiguredEmailSender,
    { provide: EMAIL_SENDER, useExisting: ConfiguredEmailSender },
    FirebasePushSender,
    { provide: PUSH_SENDER, useExisting: FirebasePushSender },
    ConfiguredSmsSender,
    { provide: SMS_SENDER, useExisting: ConfiguredSmsSender },
    OutboxWorker,
  ],
  exports: [OutboxWorker],
})
export class OutboxModule {}
