/**
 * Authentication. main's backend runs with AUTH_MODE "disabled" and exposes
 * no auth endpoints, and the web frontend's sign-in is a simulated
 * handshake. The API provider therefore reports "not_supported" for every
 * call; nothing ever pretends a sign-in succeeded, and tokens are written to
 * SecureStore only after a real backend accepts credentials.
 */
export interface AuthAvailability {
  available: boolean;
  /** Human-readable reason when unavailable. */
  reason: string;
}

export interface SignInResult {
  accessToken: string;
}

export interface AuthService {
  availability(): Promise<AuthAvailability>;
  signIn(email: string, password: string): Promise<SignInResult>;
  register(input: { name: string; email: string; password: string }): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}
