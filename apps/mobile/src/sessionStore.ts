import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "datecite.session-token";
const LOGIN_MEMORY_KEY = "datecite.login-memory";

export type StoredLoginMemory = {
  email: string;
  password: string;
  remember: boolean;
};

function getWebStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getStoredSessionToken() {
  try {
    const secureValue = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    if (secureValue) {
      return secureValue;
    }
  } catch {
    // Fall through to the browser storage fallback.
  }

  return getWebStorage()?.getItem(SESSION_TOKEN_KEY) ?? null;
}

export async function saveStoredSessionToken(token: string) {
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch {
    // Keep the auth flow alive even if secure storage is unavailable.
  }

  try {
    getWebStorage()?.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore browser storage failures too.
  }
}

export async function clearStoredSessionToken() {
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // Nothing else to do for a local MVP.
  }

  try {
    getWebStorage()?.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Nothing else to do for a local MVP.
  }
}

export async function getStoredLoginMemory(): Promise<StoredLoginMemory | null> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(LOGIN_MEMORY_KEY);
  } catch {
    // Fall through to the browser storage fallback.
  }

  raw = raw ?? getWebStorage()?.getItem(LOGIN_MEMORY_KEY) ?? null;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLoginMemory> | null;
    if (!parsed || typeof parsed.email !== "string" || typeof parsed.password !== "string") {
      return null;
    }

    return {
      email: parsed.email,
      password: parsed.password,
      remember: parsed.remember !== false,
    };
  } catch {
    return null;
  }
}

export async function saveStoredLoginMemory(input: StoredLoginMemory) {
  const raw = JSON.stringify(input);
  try {
    await SecureStore.setItemAsync(LOGIN_MEMORY_KEY, raw);
  } catch {
    // Keep auth usable even if secure storage is unavailable.
  }

  try {
    getWebStorage()?.setItem(LOGIN_MEMORY_KEY, raw);
  } catch {
    // Ignore browser storage failures too.
  }
}

export async function clearStoredLoginMemory() {
  try {
    await SecureStore.deleteItemAsync(LOGIN_MEMORY_KEY);
  } catch {
    // Nothing else to do for a local MVP.
  }

  try {
    getWebStorage()?.removeItem(LOGIN_MEMORY_KEY);
  } catch {
    // Nothing else to do for a local MVP.
  }
}
