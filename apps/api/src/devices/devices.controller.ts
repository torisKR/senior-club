import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  notificationPreferenceSchema,
  type NotificationPreferenceInput,
  registerDeviceSchema,
  type RegisterDeviceInput,
  type UnregisterDeviceInput,
  unregisterDeviceSchema,
} from "./devices.contracts";
import { DevicesService } from "./devices.service";

@Controller("v1/devices")
@UseGuards(AccessTokenGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  register(
    @Body(new ZodValidationPipe(registerDeviceSchema)) input: RegisterDeviceInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.devices.register(input, principal);
  }

  @Delete()
  @Header("Cache-Control", "private, no-store")
  unregister(
    @Body(new ZodValidationPipe(unregisterDeviceSchema)) input: UnregisterDeviceInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.devices.unregister(input.token, principal);
  }
}

@Controller("v1/me/notification-preferences")
@UseGuards(AccessTokenGuard)
export class NotificationPreferencesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.devices.preferences(principal);
  }

  @Patch()
  @Header("Cache-Control", "private, no-store")
  update(
    @Body(new ZodValidationPipe(notificationPreferenceSchema))
    input: NotificationPreferenceInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.devices.updatePreferences(input, principal);
  }
}
