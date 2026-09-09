import { AUTH_STORAGE_KEY, DEMO_CREDENTIALS } from "@/constants/auth";
import { mockUser } from "@/mock/users";
import type { AuthCredentials, AuthResponse, AuthSession } from "@/types/auth";

const createSession = (): AuthSession => ({
  token: `mock-token-${Date.now()}`,
  user: mockUser,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
});

export const isMockCredentials = (credentials: AuthCredentials): boolean => {
  const normalizedEmail = credentials.email.trim().toLowerCase();
  return (
    normalizedEmail === DEMO_CREDENTIALS.email &&
    credentials.password === DEMO_CREDENTIALS.password
  );
};

export const signInMock = (credentials: AuthCredentials): AuthResponse => {
  if (!isMockCredentials(credentials)) {
    return {
      ok: false,
      message: "Incorrect email or password. Use the demo credentials below.",
    };
  }

  const session = createSession();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  }

  return { ok: true, session };
};

export const getStoredSession = (): AuthSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AuthSession;
  } catch {
    return null;
  }
};

export const clearStoredSession = (): void => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
};

export const getCurrentUser = () => getStoredSession()?.user ?? null;
