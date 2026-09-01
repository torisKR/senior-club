import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";

export interface SendOtpEmailInput {
  email: string;
  code: string;
  expiresAt: string;
  idempotencyKey: string;
}

export interface EmailSender {
  sendOtp(input: SendOtpEmailInput): Promise<void>;
  sendApplicationUpdate(input: {
    email: string;
    eventTitle: string;
    status: string;
    idempotencyKey: string;
  }): Promise<void>;
  sendAccountDeletionRequested(input: {
    email: string;
    scheduledFor: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

@Injectable()
export class ConfiguredEmailSender implements EmailSender {
  private readonly logger = new Logger(ConfiguredEmailSender.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async sendOtp(input: SendOtpEmailInput) {
    if (this.env.EMAIL_PROVIDER === "console") {
      this.logger.log(
        `[development email] ${input.email}: 인증번호 ${input.code} (${input.expiresAt} 만료)`,
      );
      return;
    }

    await this.sendViaResend({
      email: input.email,
      subject: "[시니어클럽] 로그인 인증번호",
      text: `시니어클럽 로그인 인증번호는 ${input.code}입니다. 10분 안에 입력해 주세요. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#19372f"><h1 style="font-size:24px">시니어클럽 로그인</h1><p>아래 인증번호를 10분 안에 입력해 주세요.</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${input.code}</p><p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p></div>`,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async sendApplicationUpdate(input: {
    email: string;
    eventTitle: string;
    status: string;
    idempotencyKey: string;
  }) {
    const statusLabel =
      input.status === "APPROVED"
        ? "승인"
        : input.status === "REJECTED"
          ? "승인되지 않음"
          : input.status === "CANCELED"
            ? "취소"
            : "접수";
    if (this.env.EMAIL_PROVIDER === "console") {
      this.logger.log(
        `[development email] ${input.email}: ${input.eventTitle} 신청 ${statusLabel}`,
      );
      return;
    }

    const safeTitle = input.eventTitle
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
    await this.sendViaResend({
      email: input.email,
      subject: `[시니어클럽] 모임 신청 ${statusLabel} 안내`,
      text: `${input.eventTitle} 모임 신청이 ${statusLabel} 상태입니다. 시니어클럽 앱 또는 웹에서 자세한 내용을 확인해 주세요.`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#19372f"><h1 style="font-size:24px">모임 신청 ${statusLabel}</h1><p><strong>${safeTitle}</strong></p><p>시니어클럽 앱 또는 웹에서 자세한 내용을 확인해 주세요.</p></div>`,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async sendAccountDeletionRequested(input: {
    email: string;
    scheduledFor: string;
    idempotencyKey: string;
  }) {
    const scheduled = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Seoul",
    }).format(new Date(input.scheduledFor));
    if (this.env.EMAIL_PROVIDER === "console") {
      this.logger.log(
        `[development email] ${input.email}: 계정 삭제 예정 ${scheduled}`,
      );
      return;
    }
    await this.sendViaResend({
      email: input.email,
      subject: "[시니어클럽] 계정 삭제 요청 안내",
      text: `계정 삭제 요청이 접수되었습니다. ${scheduled}에 개인정보가 익명화됩니다. 그 전까지 다시 로그인하여 요청을 취소할 수 있습니다.`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#19372f"><h1 style="font-size:24px">계정 삭제 요청이 접수됐습니다</h1><p><strong>${scheduled}</strong>에 개인정보가 익명화됩니다.</p><p>그 전까지 다시 로그인하여 요청을 취소할 수 있습니다.</p></div>`,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private async sendViaResend(input: {
    email: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }) {
    if (!/^[\x21-\x7e]{1,256}$/.test(input.idempotencyKey)) {
      throw new Error("Invalid Resend idempotency key");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${this.env.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.env.EMAIL_FROM,
        to: [input.email],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "EMAIL_DELIVERY_FAILED",
        "이메일 제공자가 발송 요청을 처리하지 못했습니다.",
        { status: response.status, requestId },
      );
    }
  }
}
