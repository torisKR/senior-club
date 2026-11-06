export interface PhoneProofUser {
  readonly phoneNumber: string | null;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export interface PhoneCodeConfirmation {
  confirm(code: string): Promise<{ user: PhoneProofUser } | null>;
}

export interface PhoneAuthDriver {
  requestCode(phoneNumber: string, forceResend: boolean): Promise<PhoneCodeConfirmation>;
  onUserChanged(listener: (user: PhoneProofUser | null) => void, onError?: (error: unknown) => void): () => void;
  getCurrentUser(): PhoneProofUser | null;
  clearSession(): Promise<void>;
}
