import type { ProfileStateSnapshot } from '@/api/profile-api-core';

import type { PhoneAuthDriver, PhoneCodeConfirmation, PhoneProofUser } from './phone-auth-driver';
import { normalizeContactPhone, samePhoneNumber } from './phone-number';
import { PhoneVerificationError, phoneErrorCode, phoneVerificationErrorMessage } from './phone-verification-error';

export const PHONE_RESEND_DELAY_MS = 60_000;

export interface PhoneVerificationState {
  stage: 'idle' | 'sending' | 'code' | 'verifying' | 'saving' | 'link-error' | 'success';
  phoneNumber: string;
  error: string;
  codeError: boolean;
  canConfirm: boolean;
  resendAt: number;
  cleaningUp: boolean;
}

interface Dependencies {
  createDriver(): Promise<PhoneAuthDriver>;
  submitProof(idToken: string, phoneNumber: string, signal: AbortSignal): Promise<ProfileStateSnapshot>;
  onVerified(snapshot: ProfileStateSnapshot): void;
  now?: () => number;
}

const initialState: PhoneVerificationState = {
  stage: 'idle', phoneNumber: '', error: '', codeError: false,
  canConfirm: false, resendAt: 0, cleaningUp: false,
};

/** Keeps native proof credentials in memory and rejects late results after cancel/account changes. */
export class PhoneVerificationController {
  private state = initialState;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private driver: PhoneAuthDriver | null = null;
  private driverPromise: Promise<PhoneAuthDriver> | null = null;
  private nativeOperation: Promise<unknown> | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private confirmation: PhoneCodeConfirmation | null = null;
  private proofUser: PhoneProofUser | null = null;
  private completion: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private cleanup: Promise<void> | null = null;

  constructor(private readonly dependencies: Dependencies) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<PhoneVerificationState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private now() { return this.dependencies.now?.() ?? Date.now(); }
  private active(epoch: number) { return this.epoch === epoch; }

  clearCodeError() {
    if (this.state.codeError) this.update({ error: '', codeError: false });
  }

  async send(value: string, consent: boolean) {
    if (this.cleanup || this.state.cleaningUp || !['idle', 'success'].includes(this.state.stage)) return;
    if (!consent) {
      this.update({ error: '선택형 휴대폰 인증 안내를 읽고 동의해 주세요.' });
      return;
    }
    let phoneNumber: string | null;
    try { phoneNumber = normalizeContactPhone(value); } catch (error) {
      this.update({ error: error instanceof Error ? error.message : '휴대폰 번호를 확인해 주세요.' });
      return;
    }
    if (!phoneNumber) {
      this.update({ error: '인증할 휴대폰 번호를 입력해 주세요.' });
      return;
    }
    const epoch = ++this.epoch;
    this.abortController = new AbortController();
    this.completion = null;
    this.proofUser = null;
    this.confirmation = null;
    this.update({ ...initialState, stage: 'sending', phoneNumber });
    try {
      this.driverPromise = this.dependencies.createDriver();
      this.driver = await this.driverPromise;
      if (!this.active(epoch)) return;
      // Discard any prior proof session before listening for this specific phone number.
      this.nativeOperation = this.driver.clearSession();
      await this.nativeOperation;
      if (!this.active(epoch)) return;
      this.unsubscribeAuth = this.driver.onUserChanged((user) => {
        if (user && this.active(epoch) && ['sending', 'code', 'verifying'].includes(this.state.stage)
          && samePhoneNumber(user.phoneNumber, phoneNumber)) {
          void this.finish(user, epoch);
        }
      }, (error) => {
        if (this.active(epoch) && ['sending', 'code'].includes(this.state.stage)) {
          this.update({ stage: 'code', error: phoneVerificationErrorMessage(error) });
        }
      });
      await this.requestCode(false, epoch);
    } catch (error) {
      if (this.active(epoch)) {
        this.unsubscribeAuth?.();
        this.unsubscribeAuth = null;
        this.update({ stage: 'idle', error: phoneVerificationErrorMessage(error) });
      }
    }
  }

  private async requestCode(forceResend: boolean, epoch: number) {
    if (!this.driver) return;
    // Start the throttle before the native request, so a failed resend cannot be tapped repeatedly.
    this.update({ stage: 'sending', error: '', codeError: false, canConfirm: false, resendAt: this.now() + PHONE_RESEND_DELAY_MS });
    try {
      const operation = this.driver.requestCode(this.state.phoneNumber, forceResend);
      this.nativeOperation = operation;
      const confirmation = await operation;
      if (!this.active(epoch)) return;
      this.confirmation = confirmation;
      if (this.state.stage === 'sending') this.update({ stage: 'code', canConfirm: true });
    } catch (error) {
      if (this.active(epoch) && this.state.stage === 'sending') {
        this.update({ stage: 'code', canConfirm: Boolean(this.confirmation), error: phoneVerificationErrorMessage(error) });
      }
    }
  }

  async resend() {
    if (this.state.stage !== 'code' || this.now() < this.state.resendAt) return;
    this.confirmation = null;
    await this.requestCode(true, this.epoch);
  }

  async confirm(code: string) {
    if (this.state.stage !== 'code' || !this.state.canConfirm) return;
    if (!/^\d{6}$/.test(code.trim())) {
      this.update({ error: '문자에 있는 6자리 인증번호를 입력해 주세요.', codeError: true });
      return;
    }
    const epoch = this.epoch;
    this.update({ stage: 'verifying', error: '', codeError: false });
    try {
      const currentUser = this.driver?.getCurrentUser();
      if (currentUser && samePhoneNumber(currentUser.phoneNumber, this.state.phoneNumber)) {
        await this.finish(currentUser, epoch);
        return;
      }
      if (!this.confirmation) throw new PhoneVerificationError('auth/session-expired', '새 인증번호를 받아 주세요.');
      const operation = this.confirmation.confirm(code.trim());
      this.nativeOperation = operation;
      const credential = await operation;
      if (!this.active(epoch)) return;
      if (!credential?.user) throw new PhoneVerificationError('PHONE_PROOF_MISSING', '인증 결과를 확인하지 못했어요. 새 인증번호를 받아 주세요.');
      await this.finish(credential.user, epoch);
    } catch (error) {
      if (!this.active(epoch) || this.completion) return;
      const expired = ['auth/session-expired', 'auth/invalid-verification-id', 'PHONE_PROOF_MISSING'].includes(phoneErrorCode(error));
      if (expired) this.confirmation = null;
      this.update({ stage: 'code', error: phoneVerificationErrorMessage(error), codeError: true, canConfirm: !expired });
    }
  }

  private finish(user: PhoneProofUser, epoch: number): Promise<void> {
    if (!this.active(epoch)) return Promise.resolve();
    if (this.completion) return this.completion;
    if (!samePhoneNumber(user.phoneNumber, this.state.phoneNumber)) {
      this.update({ stage: 'code', error: '인증한 번호가 다릅니다. 새 인증번호를 받아 주세요.', canConfirm: false });
      return Promise.resolve();
    }
    this.proofUser = user;
    this.update({ stage: 'saving', error: '', codeError: false });
    const completion = (async () => {
      try {
        const idToken = await user.getIdToken(true);
        if (!this.active(epoch)) return;
        if (!idToken) throw new PhoneVerificationError('PHONE_PROOF_MISSING', '인증 결과를 확인하지 못했어요. 다시 인증해 주세요.');
        const snapshot = await this.dependencies.submitProof(idToken, this.state.phoneNumber, this.abortController!.signal);
        if (!this.active(epoch)) return;
        this.dependencies.onVerified(snapshot);
        this.update({ stage: 'success', canConfirm: false });
        this.unsubscribeAuth?.();
        this.unsubscribeAuth = null;
        // Android may notify automatic verification before the request/confirm promise settles.
        await this.nativeOperation?.catch(() => undefined);
        if (this.active(epoch)) {
          this.update({ cleaningUp: true });
          try { await this.driver?.clearSession(); } catch { /* Profile proof is already committed. */ }
          this.proofUser = null;
          this.confirmation = null;
          this.update({ cleaningUp: false });
        }
      } catch (error) {
        if (this.active(epoch)) this.update({ stage: 'link-error', error: phoneVerificationErrorMessage(error), canConfirm: false });
      } finally {
        if (this.active(epoch)) this.completion = null;
      }
    })();
    this.completion = completion;
    return completion;
  }

  async retryLink() {
    if (this.state.stage === 'link-error' && this.proofUser) await this.finish(this.proofUser, this.epoch);
  }

  cancel(): Promise<void> {
    if (this.cleanup) return this.cleanup;
    const epoch = ++this.epoch;
    this.abortController?.abort();
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.confirmation = null;
    this.proofUser = null;
    this.completion = null;
    this.update({ ...initialState, cleaningUp: Boolean(this.driverPromise) });
    const pending = this.nativeOperation;
    const driverPromise = this.driverPromise;
    if (!driverPromise && !pending) return Promise.resolve();
    const cleanup = (async () => {
      const result = await Promise.allSettled([driverPromise]);
      const driver = result[0]?.status === 'fulfilled' ? result[0].value : null;
      try { await driver?.clearSession(); } catch { /* A later attempt also clears stale proof. */ }
      await Promise.allSettled([pending]);
      if (this.active(epoch)) {
        this.driver = null;
        this.driverPromise = null;
        this.nativeOperation = null;
        this.update({ cleaningUp: false });
      }
      this.cleanup = null;
    })();
    this.cleanup = cleanup;
    return cleanup;
  }
}
