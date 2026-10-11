# CampusLuma Firebase Authentication Setup

CampusLuma uses Firebase Authentication for email/password identity verification, password reset, and Google sign-in. FastAPI independently verifies Firebase ID tokens with the Admin SDK, then creates a least-privilege `viewer` account on first verified sign-in. Existing database roles are retained; client claims never assign application roles. Guest Demo is a separate backend-issued session restricted to isolated synthetic sandbox data.

## Firebase Console

1. Select the Firebase project used by this deployment.
2. In **Authentication â†’ Sign-in method**, enable **Email/Password** and **Google**. Select the support email requested by Firebase for Google sign-in.
3. In **Authentication â†’ Settings â†’ Authorized domains**, include `localhost` for local development and the exact hostnames used by deployed frontends.
4. In **Project settings â†’ General â†’ Your apps**, register a Web app. Its Web API key and project ID are browser configuration, not secrets. Do not put service-account credentials in frontend configuration.
5. In **Authentication â†’ Templates**, configure the verification and password-reset sender, support address, and action URLs.

## Local environment

Create `frontend/.env.local` (not committed) with:

```dotenv
VITE_AUTH_MODE=firebase
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_API_KEY=your-firebase-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project-id.firebaseapp.com
```

Set backend variables in the backend PowerShell session:

Generate a deployment-specific `CAMPUS_JWT_SECRET` with at least 32 random bytes and store it in the backend secret manager. Firebase-mode startup rejects missing and placeholder signing keys.

```powershell
$env:CAMPUS_AUTH_MODE = "firebase"
$env:FIREBASE_PROJECT_ID = "your-firebase-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\path\firebase-service-account.json"
```

Store the Admin SDK JSON outside the repository, restrict filesystem access, and never expose it in logs, frontend variables, or source control. Application Default Credentials may be used instead where configured securely.

The first verified Firebase sign-in creates a local `viewer` account if one does not already exist. An administrator must separately provision elevated roles through the existing secure account-management process. A Firebase custom claim or browser-supplied role has no effect on application permissions.

## Supported flows and verification

- **Email/password registration:** The Firebase identity is created and a verification email is requested. The user must verify the address before sign-in; the first verified backend exchange provisions `viewer` access.
- **Email/password sign-in:** Firebase verifies credentials and the verified-email state; the backend independently verifies the ID token.
- **Password reset:** Firebase sends the password-reset action to the entered email address.
- **Google sign-in:** The frontend uses Firebase Web SDK `GoogleAuthProvider` with a popup. It sends the resulting Firebase ID token to the existing `/auth/firebase` endpoint. FastAPI independently verifies it and uses the application user table for role assignment. Backend and Firebase sessions are cleared on logout.
- **Guest Demo:** A separate backend-issued session with provenance-filtered synthetic data and editable workflows confined to an isolated demo database.

Guest Demo can import explicitly labelled synthetic records, create/update demo interventions, run available predictions, and export reports within its separate sandbox. Its bundled CSV seed is copied into data/campus_demo.db by additive inserts at startup. Set CAMPUS_DEMO_DB_PATH to place that sandbox database elsewhere. The restore action clears only demo imports, observations, interventions, and student rows from that separate database, then restores the bundled synthetic baseline. It does not touch CAMPUS_DB_PATH.

Google provider enablement, support email, OAuth project configuration, and authorized domains must be set in Firebase Console. The UI maps cancellation, blocked popups, unauthorized domains, disabled providers, and network errors to actionable messages. To verify a deployment, test successful Google login, cancellation, and popup-blocked behavior on each hostname. Live Google OAuth, mailbox delivery, and production-domain behavior are not verified by the local automated suite.

To verify email registration and reset, use a test Firebase project and mailbox you control. Confirm the account appears in Firebase Authentication, complete the verification link, sign in, and confirm its application role is `viewer`.

## Common issues

- `OPERATION_NOT_ALLOWED`: enable Email/Password in Firebase Authentication.
- `auth/operation-not-allowed`: enable Google in Firebase Authentication â†’ Sign-in method.
- Verification email not received: inspect Firebase Authentication templates, recipient spam folder, sender setup, and project quotas.
- `FIREBASE_PROJECT_ID` missing or Admin SDK initialization failure: set the backend project ID and configure server-side Admin credentials.
- Invalid or revoked ID token: sign in again and verify the frontend and backend project IDs match.
- `auth/unauthorized-domain`: add the exact browser hostname under Authorized domains; never bypass backend token verification.
- `auth/popup-blocked`: allow popups for the app hostname. `auth/popup-closed-by-user` means sign-in was cancelled.

For production, use HTTPS, restrict Firebase API keys by appropriate referrers/APIs, set deployment domains explicitly, and apply the institution's identity, privacy, and data-retention policies.

For Cloudflare Pages frontend settings, production API URL, backend CORS, and durable separate SQLite storage, see [CLOUDFLARE_PAGES_DEPLOYMENT.md](CLOUDFLARE_PAGES_DEPLOYMENT.md).
