import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AccountDeletionService } from "./account-deletion.service";
import { AccountDeletionWorker } from "./account-deletion.worker";
import { AccountController } from "./account.controller";

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountDeletionService, AccountDeletionWorker],
})
export class AccountModule {}
