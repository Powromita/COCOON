/**
 * Auth token storage — web. expo-secure-store has no web implementation,
 * and the web build is a development preview only, so no token is ever
 * persisted there. See tokenStore.native.ts for the device implementation.
 */
export async function readAccessToken(): Promise<string | null> {
  return null;
}

export async function writeAccessToken(_token: string): Promise<void> {
  throw new Error("Signing in is only supported in the mobile app.");
}

export async function clearAccessToken(): Promise<void> {}
