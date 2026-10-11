import { getApps, initializeApp, type FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type OAuthCredential,
  type User,
} from 'firebase/auth';

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
const AUTH_DOMAIN = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || (PROJECT_ID ? `${PROJECT_ID}.firebaseapp.com` : '');
const REQUEST_TIMEOUT_MS = 20_000;
const POPUP_TIMEOUT_MS = 120_000;

export const usesFirebaseAuth = import.meta.env.VITE_AUTH_MODE?.trim().toLowerCase() === 'firebase';
export const firebaseConfigured = Boolean(API_KEY && PROJECT_ID && AUTH_DOMAIN);

export class FirebaseAuthError extends Error {
  constructor(message: string, public code = 'auth/unknown') {
    super(message);
    this.name = 'FirebaseAuthError';
  }
}

type FirebaseLikeError = {
  code?: string;
  customData?: { email?: string };
};

let pendingGoogleCredential: OAuthCredential | null = null;
let pendingGoogleEmail = '';

function getFirebaseAuth() {
  if (!firebaseConfigured || !API_KEY || !PROJECT_ID || !AUTH_DOMAIN) {
    throw new FirebaseAuthError('Firebase sign-in is selected, but the web API key, project ID, and Auth domain must be configured in frontend/.env.local.', 'auth/configuration-not-found');
  }

  const existingApp = getApps().find((app) => app.name === '[DEFAULT]');
  if (existingApp && (existingApp.options.projectId !== PROJECT_ID || existingApp.options.apiKey !== API_KEY)) {
    throw new FirebaseAuthError('The active Firebase app uses a different project than frontend/.env.local. Restart Vite after correcting the project settings.', 'auth/project-mismatch');
  }
  const app = existingApp || initializeApp({ apiKey: API_KEY, projectId: PROJECT_ID, authDomain: AUTH_DOMAIN });
  return getAuth(app);
}

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new FirebaseAuthError(`${label} timed out. Check your connection and Firebase project, then try again.`, 'auth/timeout')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer!));
}

function mappedFirebaseError(error: unknown): FirebaseAuthError {
  const code = (error as FirebaseLikeError)?.code || 'auth/unknown';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/invalid-login-credentials': 'Invalid email or password.',
    'auth/user-not-found': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/email-already-in-use': 'An account already exists for this email. Sign in or reset its password.',
    'auth/email-already-exists': 'An account already exists for this email. Sign in or reset its password.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/operation-not-allowed': 'This sign-in provider is disabled in Firebase Console. Enable Email/Password or Google under Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'This website is not authorized for Firebase sign-in. Add its hostname under Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/network-request-failed': 'Could not reach Firebase Authentication. Check the network and try again.',
    'auth/too-many-requests': 'Firebase temporarily paused sign-in after too many attempts. Wait, then try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled before it completed.',
    'auth/cancelled-popup-request': 'Another Google sign-in popup is already open. Complete or close it, then try again.',
    'auth/popup-blocked': 'The browser blocked the Google popup. Allow popups for this site, then try again.',
    'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Sign in with that email and password to securely link Google to the same Firebase account.',
    'auth/credential-already-in-use': 'That Google account is already linked to a different CampusLuma account. Sign in with the account that already uses Google.',
    'auth/provider-already-linked': 'Google is already linked to this Firebase account. Return to sign-in and continue with Google.',
    'auth/invalid-api-key': 'Firebase rejected the web API key. Check frontend/.env.local and restart Vite.',
    'auth/timeout': 'Firebase Authentication did not respond in time. Check your connection and try again.',
  };
  return new FirebaseAuthError(messages[code] || 'Firebase Authentication could not complete this request. Check the provider and project settings, then try again.', code);
}

async function readyAuth() {
  const auth = getFirebaseAuth();
  await withTimeout(auth.authStateReady(), 'Firebase initialization');
  return auth;
}

async function verifiedUser(user: User): Promise<User> {
  await withTimeout(reload(user), 'Email verification check');
  if (!user.emailVerified) {
    try {
      await withTimeout(sendEmailVerification(user), 'Verification email request');
    } catch (error) {
      throw new FirebaseAuthError(`Your email is not verified yet, and Firebase could not resend the link. ${mappedFirebaseError(error).message}`, 'auth/email-not-verified');
    }
    throw new FirebaseAuthError('Your email is not verified yet. Firebase has sent a verification link; verify the address and sign in again.', 'auth/email-not-verified');
  }
  return user;
}

async function safeSignOut(): Promise<void> {
  const app = getApps().find((item) => item.name === '[DEFAULT]');
  if (app) await signOut(getAuth(app)).catch(() => undefined);
}

export async function firebaseGoogleSignIn(email?: string): Promise<string> {
  const auth = await readyAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const requestedEmail = email?.trim().toLowerCase();
  try {
    let user: User;
    if (auth.currentUser && requestedEmail && auth.currentUser.email?.toLowerCase() === requestedEmail) {
      if (auth.currentUser.providerData.some((item) => item.providerId === GoogleAuthProvider.PROVIDER_ID)) {
        user = auth.currentUser;
      } else if (pendingGoogleCredential && pendingGoogleEmail === requestedEmail) {
        user = (await withTimeout(linkWithCredential(auth.currentUser, pendingGoogleCredential), 'Google account linking')).user;
        pendingGoogleCredential = null;
        pendingGoogleEmail = '';
      } else {
        user = (await withTimeout(linkWithPopup(auth.currentUser, provider), 'Google account linking', POPUP_TIMEOUT_MS)).user;
      }
    } else {
      const result = await withTimeout(signInWithPopup(auth, provider), 'Google sign-in', POPUP_TIMEOUT_MS);
      user = result.user;
    }
    await withTimeout(reload(user), 'Google account verification');
    if (!user.emailVerified) {
      await safeSignOut();
      throw new FirebaseAuthError('Google did not return a verified email address for this account.', 'auth/email-not-verified');
    }
    return await withTimeout(user.getIdToken(true), 'Firebase token refresh');
  } catch (error) {
    const firebaseError = error as FirebaseLikeError;
    if (firebaseError.code === 'auth/account-exists-with-different-credential') {
      const credential = GoogleAuthProvider.credentialFromError(error as FirebaseError);
      const address = firebaseError.customData?.email?.trim().toLowerCase() || '';
      if (credential && address) {
        pendingGoogleCredential = credential;
        pendingGoogleEmail = address;
      }
    }
    throw error instanceof FirebaseAuthError ? error : mappedFirebaseError(error);
  }
}

export async function firebaseSignOut(): Promise<void> {
  await safeSignOut();
  pendingGoogleCredential = null;
  pendingGoogleEmail = '';
}

export async function firebaseCreateAccount(email: string, password: string): Promise<void> {
  const auth = await readyAuth();
  try {
    const result = await withTimeout(createUserWithEmailAndPassword(auth, email, password), 'Account creation');
    try {
      await withTimeout(sendEmailVerification(result.user), 'Verification email request');
    } catch (error) {
      throw new FirebaseAuthError(`Your Firebase account was created, but the verification email could not be sent. Use Resend verification to try again. ${mappedFirebaseError(error).message}`, 'auth/account-created-verification-failed');
    }
  } catch (error) {
    throw error instanceof FirebaseAuthError ? error : mappedFirebaseError(error);
  } finally {
    await safeSignOut();
  }
}

export async function firebaseResendVerification(email: string, password: string): Promise<boolean> {
  const auth = await readyAuth();
  try {
    const result = await withTimeout(signInWithEmailAndPassword(auth, email, password), 'Firebase sign-in');
    await withTimeout(reload(result.user), 'Email verification check');
    if (result.user.emailVerified) return false;
    await withTimeout(sendEmailVerification(result.user), 'Verification email request');
    return true;
  } catch (error) {
    throw error instanceof FirebaseAuthError ? error : mappedFirebaseError(error);
  } finally {
    await safeSignOut();
  }
}

export async function firebaseSignIn(email: string, password: string): Promise<string> {
  const auth = await readyAuth();
  try {
    const result = await withTimeout(signInWithEmailAndPassword(auth, email, password), 'Firebase sign-in');
    const user = await verifiedUser(result.user);
    if (pendingGoogleCredential && user.email?.toLowerCase() === pendingGoogleEmail) {
      await withTimeout(linkWithCredential(user, pendingGoogleCredential), 'Google account linking');
      pendingGoogleCredential = null;
      pendingGoogleEmail = '';
    }
    return await withTimeout(user.getIdToken(true), 'Firebase token refresh');
  } catch (error) {
    if ((error as FirebaseLikeError)?.code === 'auth/email-not-verified') await safeSignOut();
    throw error instanceof FirebaseAuthError ? error : mappedFirebaseError(error);
  }
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  const auth = await readyAuth();
  try {
    await withTimeout(sendPasswordResetEmail(auth, email), 'Password reset request');
  } catch (error) {
    throw error instanceof FirebaseAuthError ? error : mappedFirebaseError(error);
  }
}
