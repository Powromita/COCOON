/**
 * Auth token storage — Android/iOS. Tokens live only in SecureStore
 * (Android Keystore-backed), never in AsyncStorage or SQLite.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "cocoon.auth.access_token";

export async function readAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
