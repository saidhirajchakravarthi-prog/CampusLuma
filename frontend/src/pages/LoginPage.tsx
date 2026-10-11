import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/useAuth';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Globe,
} from 'lucide-react';
import { Alert } from '../components/ui/Alert';
import { FirebaseAuthError, firebaseConfigured, firebaseCreateAccount, firebaseResendVerification, sendFirebasePasswordReset, usesFirebaseAuth } from '../firebaseAuth';
import academicHero from '../assets/academic-hero.svg';
import campusLumaMark from '../assets/campusluma-mark.svg';

const DEMO_ACCOUNTS = [
  { label: 'Administrator', email: 'admin@campus.edu', password: 'AdminPassword123!', role: 'admin' },
  { label: 'Academic Staff', email: 'staff@campus.edu', password: 'StaffPassword123!', role: 'staff' },
  { label: 'Analyst', email: 'analyst@campus.edu', password: 'AnalystPassword123!', role: 'analyst' },
  { label: 'Campus Viewer', email: 'viewer@campus.edu', password: 'ViewerPassword123!', role: 'viewer' },
];

export function LoginPage() {
  const { login, loginWithGoogle, enterGuestMode, error, clearError } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreatedMessage, setAccountCreatedMessage] = useState<string | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const authBusy = isSubmitting || isGuestSubmitting || isGoogleSubmitting || verificationBusy || resetBusy;
  const canResendVerification = usesFirebaseAuth && (Boolean(accountCreatedMessage) || /not verified|verification email/i.test(error || ''));

  const handlePasswordReset = async () => {
    clearError();
    const email = emailInput.trim();
    if (!email) {
      setResetError('Enter your email address first so Firebase knows where to send the reset link.');
      setResetMessage(null);
      return;
    }
    setResetBusy(true);
    setResetError(null);
    setResetMessage(null);
    try {
      await sendFirebasePasswordReset(email);
      setResetMessage('If this address belongs to a Firebase account, a password reset email has been sent.');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Firebase could not send a password reset email.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isCreatingAccount) {
      await handleCreateAccount();
      return;
    }
    const email = emailInput.trim();
    const password = passwordInput;

    if (!email) {
      setLocalError('Please enter your institutional email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your account password.');
      return;
    }
    const minimumLength = usesFirebaseAuth ? 6 : 4;
    if (password.length < minimumLength) {
      setLocalError(`Password must be at least ${minimumLength} characters long.`);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // Error is stored in AuthContext and displayed
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    clearError();
    const email = emailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError('Enter a valid email address to create your account.');
      return;
    }
    if (passwordInput.length < 8) {
      setLocalError('Use a password with at least 8 characters.');
      return;
    }
    setLocalError(null);
    setAccountCreatedMessage(null);
    setIsSubmitting(true);
    try {
      await firebaseCreateAccount(email, passwordInput);
      setAccountCreatedMessage('Your Firebase account was created. Check your inbox for a verification link, then return here to sign in.');
      setVerificationNotice(null);
      setIsCreatingAccount(false);
    } catch (err) {
      if (err instanceof FirebaseAuthError && err.code === 'auth/account-created-verification-failed') {
        setAccountCreatedMessage(err.message);
        setIsCreatingAccount(false);
      } else {
        setLocalError(err instanceof Error ? err.message : 'Firebase could not create this account.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const email = emailInput.trim();
    if (!email || !passwordInput) {
      setVerificationNotice({ type: 'error', message: 'Enter the account email and password to request another verification email.' });
      return;
    }
    setVerificationBusy(true);
    setVerificationNotice(null);
    try {
      const sent = await firebaseResendVerification(email, passwordInput);
      setVerificationNotice({
        type: 'success',
        message: sent ? 'A new verification email was requested.' : 'This email is already verified. You can sign in now.',
      });
    } catch (err) {
      setVerificationNotice({ type: 'error', message: err instanceof Error ? err.message : 'Firebase could not resend the verification email.' });
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleGuestDemo = async () => {
    setLocalError(null);
    setIsGuestSubmitting(true);
    try {
      await enterGuestMode();
    } catch {
      // The authentication context provides a readable API error.
    } finally {
      setIsGuestSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setIsGoogleSubmitting(true);
    try {
      await loginWithGoogle(emailInput.trim());
    } catch {
      // The authentication context provides the provider or backend error.
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleFillDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmailInput(acc.email);
    setPasswordInput(acc.password);
    setLocalError(null);
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-[#0b1329] flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white relative">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(79,70,229,0.25),rgba(255,255,255,0))] pointer-events-none" />

      <div className="relative z-10 grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(25rem,.9fr)]">
      <section className="hidden lg:block text-white" aria-label="CampusLuma learning analytics introduction">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">Student success, made visible</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">A clearer picture of every learner.</h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">Bring academic progress, engagement signals and supportive follow-up into one calm, evidence-led workspace.</p>
        </div>
        <img src={academicHero} alt="Illustration of a campus, open book and student learning insights" className="mt-6 w-full max-w-2xl drop-shadow-2xl" />
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">Explainable indicators</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">Human-led support</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">Seven data categories</span>
        </div>
      </section>
      <div className="w-full max-w-md relative z-10 mx-auto">
        {/* Brand identity header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#111d3b] border border-indigo-300/25 shadow-lg shadow-indigo-500/20 mb-3">
            <img src={campusLumaMark} alt="" className="w-11 h-11" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            CampusLuma
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
            AI-Powered Student Success Intelligence
          </p>
          <p className="text-[11px] font-medium text-teal-300 mt-1">Illuminate Student Success.</p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xl p-7 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">{isCreatingAccount ? 'Create your account' : 'Sign In to Your Workspace'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your institutional credentials to access student analytics.
            </p>
          </div>

          {displayError && (
            <Alert type="error" title="Sign-In Error">
              {displayError}
            </Alert>
          )}
          {usesFirebaseAuth && !firebaseConfigured && (
            <Alert type="error" title="Firebase setup required">
              Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in frontend/.env.local, and configure the backend Firebase Admin credentials.
            </Alert>
          )}
          {resetMessage && <Alert type="success" title="Password reset requested">{resetMessage}</Alert>}
          {resetError && <Alert type="error" title="Password reset unavailable">{resetError}</Alert>}
          {accountCreatedMessage && <Alert type="success" title="Verify your email">{accountCreatedMessage}</Alert>}
          {verificationNotice && <Alert type={verificationNotice.type} title={verificationNotice.type === 'success' ? 'Verification status' : 'Verification email unavailable'}>{verificationNotice.message}</Alert>}
          {canResendVerification && (
            <button type="button" onClick={handleResendVerification} disabled={verificationBusy} className="-mt-3 text-xs font-semibold text-indigo-700 underline underline-offset-2 disabled:opacity-50">
              {verificationBusy ? 'Requesting another email…' : 'Resend verification email'}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="user-email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Institutional Email
              </label>
              <div className="relative">
                <input
                  id="user-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="name@campus.edu"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  disabled={authBusy}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {/* Password Field with Visibility Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="user-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Password
                </label>
                {usesFirebaseAuth && <button type="button" onClick={handlePasswordReset} disabled={resetBusy} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">{resetBusy ? 'Sending…' : 'Forgot password?'}</button>}
              </div>
              <div className="relative">
                <input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                  placeholder="Enter your account password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  disabled={authBusy}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={authBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>{isCreatingAccount ? 'Create account' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {usesFirebaseAuth && firebaseConfigured && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              {isGoogleSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
              <span>{isGoogleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </button>
          )}

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleGuestDemo}
              disabled={authBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-teal-700 bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
            >
              {isGuestSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  <span>Preparing Guest Demo…</span>
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  <span>Explore as Guest</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-500">Guest Demo uses synthetic data in an isolated sandbox. Demo changes stay there.</p>
          </div>

          {usesFirebaseAuth && firebaseConfigured && (
            <div className="text-center text-xs text-slate-500">
              {isCreatingAccount ? 'Already have an account?' : 'New to CampusLuma?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsCreatingAccount(!isCreatingAccount);
                  setLocalError(null);
                  clearError();
                  setAccountCreatedMessage(null);
                }}
                className="font-semibold text-indigo-700 underline-offset-2 hover:underline focus-visible:underline"
              >
                {isCreatingAccount ? 'Sign in' : 'Create account'}
              </button>
              {isCreatingAccount && (
                <>
                  <p className="mt-2 text-[11px]">Use at least 8 characters. Email verification is required before access.</p>
                </>
              )}
            </div>
          )}

          {/* Quick-Fill Demo Credentials Drawer */}
          {!usesFirebaseAuth && <div className="pt-4 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 block">
              Local Development Demo Accounts:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => handleFillDemo(acc)}
                  className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 text-left transition-colors group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600">
                      {acc.label}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      {acc.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block truncate mt-0.5">
                    {acc.email}
                  </span>
                </button>
              ))}
            </div>
          </div>}

          {/* Security Architecture Badge */}
          <div className="pt-2 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <span>{usesFirebaseAuth
              ? 'Firebase verifies the account email and password. The API verifies the Firebase ID token, then assigns permissions from its own user-role database.'
              : 'Passwords are salted and hashed using PBKDF2-HMAC-SHA256. Sessions use expiring signed tokens with backend-enforced roles.'}</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>KPMG India Smart Campus Analytics Challenge</span>
        </div>
      </div>
      </div>
    </div>
  );
}
