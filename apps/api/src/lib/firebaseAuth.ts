import { config } from "../config.js";

type FirebasePasswordResponse = {
  localId?: string;
  email?: string;
  displayName?: string;
  idToken?: string;
  error?: {
    message?: string;
  };
};

async function firebasePasswordRequest(action: "signUp" | "signInWithPassword", input: { email: string; password: string }) {
  if (!config.firebaseAuthEnabled) {
    throw new Error("Firebase email login no esta configurado. Define FIREBASE_WEB_API_KEY.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(config.firebaseWebApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  const payload = (await response.json()) as FirebasePasswordResponse;

  if (!response.ok || !payload.localId || !payload.email) {
    const message = payload.error?.message ?? "firebase_auth_failed";
    throw new Error(`Firebase rechazo la autenticacion: ${message}`);
  }

  return {
    firebaseUid: payload.localId,
    email: payload.email.trim().toLowerCase(),
    displayName: payload.displayName ?? "",
    idToken: payload.idToken ?? "",
  };
}

export function createFirebaseEmailUser(input: { email: string; password: string }) {
  return firebasePasswordRequest("signUp", input);
}

export function loginFirebaseEmailUser(input: { email: string; password: string }) {
  return firebasePasswordRequest("signInWithPassword", input);
}
