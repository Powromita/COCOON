export type AuthRole = "designer" | "operator" | "viewer";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  organization: string;
};

export type AuthCredentials = {
  email: string;
  password: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  expiresAt: string;
};

export type AuthResponse =
  | {
      ok: true;
      session: AuthSession;
    }
  | {
      ok: false;
      message: string;
    };
