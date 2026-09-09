"use client";

import { useEffect, useState } from "react";

import { clearStoredSession, getStoredSession, signInMock } from "@/services/auth";
import type { AuthCredentials, AuthSession } from "@/types/auth";

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  const login = async (credentials: AuthCredentials) => {
    const result = signInMock(credentials);

    if (!result.ok) {
      return result;
    }

    setSession(result.session);
    return result;
  };

  const logout = () => {
    clearStoredSession();
    setSession(null);
  };

  return { session, login, logout };
}
