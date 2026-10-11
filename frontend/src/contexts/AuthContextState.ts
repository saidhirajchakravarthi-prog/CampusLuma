import { createContext } from 'react';

export interface UserProfile {
  email: string | null;
  name: string | null;
  role: string;
  auth_type?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  role: string | null;
  error: string | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (email?: string) => Promise<void>;
  enterGuestMode: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
