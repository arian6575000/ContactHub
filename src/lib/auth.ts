// Google sign-in (OAuth 2.0 authorization-code + PKCE, no client secret) via expo-auth-session.
// Requests the Drive "appdata" scope (a hidden, app-private folder) plus basic profile.
//
// Setup (see README): create an *Android* OAuth client in Google Cloud Console with package name
// com.arian.contracthub + your signing SHA-1, enable "custom URI scheme" for it, then set
// EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID. This needs a development/APK build — it does not run in Expo Go.
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const APP_ID = 'com.arian.contracthub';
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata'];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

export interface GoogleProfile { email: string; name: string; picture: string | null }
interface StoredSession { refreshToken: string; accessToken: string; expiresAt: number; profile: GoogleProfile }

const KEY = 'contracthub.google.session';

export const googleConfigured = () => GOOGLE_CLIENT_ID.length > 0;

async function load(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch { return null; }
}
async function save(s: StoredSession) { await SecureStore.setItemAsync(KEY, JSON.stringify(s)); }

export async function getProfile(): Promise<GoogleProfile | null> {
  return (await load())?.profile ?? null;
}

export async function signIn(): Promise<GoogleProfile> {
  if (!googleConfigured()) {
    throw new Error('Google sign-in is not configured yet. Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID and rebuild (see README).');
  }
  const redirectUri = AuthSession.makeRedirectUri({ native: `${APP_ID}:/oauthredirect` });
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri,
    scopes: SCOPES,
    usePKCE: true,
    extraParams: { access_type: 'offline' },
    prompt: AuthSession.Prompt.SelectAccount,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' || result.type === 'dismiss' ? 'Sign-in cancelled' : 'Google sign-in failed');
  }
  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  if (!tokens.refreshToken) {
    throw new Error('Google did not return a refresh token. Remove the app from your Google account permissions and try again.');
  }
  const info = await AuthSession.fetchUserInfoAsync({ accessToken: tokens.accessToken }, discovery);
  const profile: GoogleProfile = {
    email: String(info.email ?? ''), name: String(info.name ?? info.email ?? ''), picture: info.picture ?? null,
  };
  await save({
    refreshToken: tokens.refreshToken, accessToken: tokens.accessToken,
    expiresAt: Date.now() + (tokens.expiresIn ?? 3600) * 1000, profile,
  });
  return profile;
}

/** A valid access token, refreshed silently when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  const s = await load();
  if (!s) throw new Error('Not signed in');
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  try {
    const t = await AuthSession.refreshAsync({ clientId: GOOGLE_CLIENT_ID, refreshToken: s.refreshToken }, discovery);
    const next: StoredSession = {
      ...s, accessToken: t.accessToken, expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000,
      refreshToken: t.refreshToken ?? s.refreshToken,
    };
    await save(next);
    return next.accessToken;
  } catch {
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
    throw new Error('Your Google session expired. Please sign in again.');
  }
}

export async function signOut(): Promise<void> {
  const s = await load();
  if (s) {
    try { await AuthSession.revokeAsync({ token: s.refreshToken, clientId: GOOGLE_CLIENT_ID }, discovery); } catch { /* offline is fine */ }
  }
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}
