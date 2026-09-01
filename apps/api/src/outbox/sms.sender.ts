import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";

export interface SendOtpSmsInput {
  phoneNumber: string;
  code: string;
  expiresAt: string;
  idempotencyKey: string;
}

export interface SmsSender {
  sendOtp(input: SendOtpSmsInput): Promise<void>;
}

export const SMS_SENDER = Symbol("SMS_SENDER");

@Injectable()
export class ConfiguredSmsSender implements SmsSender {
  private readonly logger = new Logger(ConfiguredSmsSender.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async sendOtp(input: SendOtpSmsInput) {
    if (this.env.SMS_PROVIDER === "console") {
      this.logger.log(
        `[development sms] ${maskPhoneNumber(input.phoneNumber)}: 인증번호 ${input.code} (${input.expiresAt} 만료)`,
      );
      return;
    }

    const accountSid = this.env.TWILIO_ACCOUNT_SID;
    const authToken = this.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error("Twilio SMS credentials are not configured");
    }
    if (!/^auth-otp:[A-Za-z0-9-]{8,128}$/.test(input.idempotencyKey)) {
      throw new Error("Invalid SMS idempotency key");
    }

    const form = new URLSearchParams({
      To: input.phoneNumber,
      Body: `시니어클럽 인증번호는 ${input.code}입니다. 10분 안에 입력해 주세요.`,
    });
    if (this.env.TWILIO_MESSAGING_SERVICE_SID) {
      form.set("MessagingServiceSid", this.env.TWILIO_MESSAGING_SERVICE_SID);
    } else if (this.env.TWILIO_FROM_NUMBER) {
      form.set("From", this.env.TWILIO_FROM_NUMBER);
    } else {
      throw new Error("Twilio sender is not configured");
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: form,
      },
    );
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "SMS_DELIVERY_FAILED",
        "문자 메시지 제공자가 발송 요청을 처리하지 못했습니다.",
        { status: response.status, requestId },
      );
    }
  }
}

export function maskPhoneNumber(phoneNumber: string) {
  if (phoneNumber.length < 7) return "***";
  return `${phoneNumber.slice(0, 4)}***${phoneNumber.slice(-3)}`;
}
