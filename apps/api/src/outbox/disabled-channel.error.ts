export class DisabledChannelError extends Error {
  constructor(provider: "EMAIL_PROVIDER" | "SMS_PROVIDER" | "PUSH_PROVIDER" | "AUTH_PROVIDER") {
    super(`${provider}=disabled: delivery unavailable`);
    this.name = "DisabledChannelError";
  }
}
