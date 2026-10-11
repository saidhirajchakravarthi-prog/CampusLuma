import { useState, useCallback, useEffect, ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { firebaseGoogleSignIn, firebaseSignIn, firebaseSignOut, FirebaseAuthError, usesFirebaseAuth } from '../firebaseAuth';
import { AuthContext, UserProfile } from './AuthContextState';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem('siq_token')));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = usesFirebaseAuth
        ? await api.loginWithFirebase(await firebaseSignIn(email, password))
        : await api.login(email, password);
      const userProfile: UserProfile = {
        email: res.user.email,
        name: res.user.name,
        role: res.user.role,
        auth_type: usesFirebaseAuth ? 'firebase_session' : 'user_session',
      };
      setUser(userProfile);
      setRole(res.user.role);
      setIsAuthenticated(true);
    } catch (err) {
      api.setToken(null);
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      if (err instanceof FirebaseAuthError) {
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.status === 401
          ? usesFirebaseAuth ? 'Firebase accepted the sign-in, but the backend rejected its ID token. Confirm both services use the same Firebase project and that the email is verified.' : 'Invalid email or password. Please verify your credentials and try again.'
          : err.message);
      } else {
        setError('Could not connect to the CampusLuma API. Check VITE_API_BASE_URL or confirm the local backend is running.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (email?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!usesFirebaseAuth) {
        throw new FirebaseAuthError('Google sign-in is available when Firebase authentication is enabled. Set VITE_AUTH_MODE=firebase and configure the Firebase web app.');
      }
      const idToken = await firebaseGoogleSignIn(email);
      const res = await api.loginWithFirebase(idToken);
      setUser({ email: res.user.email, name: res.user.name, role: res.user.role, auth_type: 'firebase_session' });
      setRole(res.user.role);
      setIsAuthenticated(true);
    } catch (err) {
      api.setToken(null);
      if (!(err instanceof FirebaseAuthError && err.code === 'auth/account-exists-with-different-credential')) {
        firebaseSignOut().catch(() => {});
      }
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      if (err instanceof FirebaseAuthError) {
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Firebase could not verify this Google account. Sign in again and confirm the account email is verified.' : err.message);
      } else {
        setError('Could not connect to the CampusLuma API. Check VITE_API_BASE_URL or confirm the local backend is running.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const enterGuestMode = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await firebaseSignOut();
      await api.createGuestSession();
      setUser({ email: null, name: 'Guest Demo', role: 'guest', auth_type: 'guest' });
      setRole('guest');
      setIsAuthenticated(true);
    } catch (err) {
      api.setToken(null);
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      setError(err instanceof ApiError
        ? err.message
        : 'Could not connect to the CampusLuma API. Check VITE_API_BASE_URL or confirm the local backend is running.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    firebaseSignOut().catch(() => {});
    setIsAuthenticated(false);
    setUser(null);
    setRole(null);
    setError(null);
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      setError('Your session expired. Sign in again to continue.');
    };
    window.addEventListener('siq:session-expired', handleSessionExpired);
    return () => window.removeEventListener('siq:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('siq_token');
    if (savedToken) {
      api.validateSession()
        .then((session) => {
          setUser({
            email: session.email || null,
            name: session.name || null,
            role: session.role,
            auth_type: session.auth_type,
          });
          setRole(session.role);
          setIsAuthenticated(true);
        })
        .catch(() => {
          // Remove an invalid token and explain that the saved session needs attention.
          api.setToken(null);
          setIsAuthenticated(false);
          setUser(null);
          setRole(null);
          setError('Your saved session could not be verified. Sign in again, and check that the API is available.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, role, error, clearError, login, loginWithGoogle, enterGuestMode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
