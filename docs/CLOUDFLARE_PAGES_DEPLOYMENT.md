# Cloudflare Pages Deployment

Cloudflare Pages hosts the static React/Vite frontend only. Run FastAPI as a separate service on a host that supports Python, Firebase Admin SDK credentials, and persistent storage. The Pages filesystem is not a backend runtime or durable SQLite store.

## Pages build settings

Connect the repository to Cloudflare Pages and use:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |

Set these as **Production** build environment variables in Pages. Vite embeds them into the browser bundle at build time; set the matching values for Preview deployments only when they should use a non-production API and Firebase project.

| Variable | Production value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.example.com` — FastAPI origin, with no trailing slash and no `/api` suffix |
| `VITE_AUTH_MODE` | `firebase` |
| `VITE_FIREBASE_PROJECT_ID` | `your-firebase-project-id` |
| `VITE_FIREBASE_API_KEY` | Firebase Web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-firebase-project-id.firebaseapp.com` |

The Firebase Web API key and project identifiers are browser configuration, not Admin SDK credentials. Never configure a private key, service-account JSON, backend JWT secret, or local `.env` file as a Pages variable. The `/api` Vite proxy remains available for local development; production requests use `VITE_API_BASE_URL` directly.

## Backend service configuration

Set these variables on the FastAPI host, not in Pages. Add secrets through that host's secret manager:

| Variable | Required production value |
|---|---|
| `CAMPUS_AUTH_MODE` | `firebase` |
| `CAMPUS_JWT_SECRET` | A unique randomly generated value of at least 32 bytes |
| `FIREBASE_PROJECT_ID` | Same project ID as the frontend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a server-side service-account file mounted by the host's secret manager; workload/application-default credentials may be used instead |
| `CAMPUS_CORS_ORIGINS` | Comma-separated exact frontend origins, e.g. `https://your-project.pages.dev,https://app.example.com` |
| `CAMPUS_DB_PATH` | Path to the persistent operational database, e.g. `/var/lib/campusluma/campus.db` |
| `CAMPUS_DEMO_DB_PATH` | A different persistent file for guest demo data, e.g. `/var/lib/campusluma/campus_demo.db` |

Generate `CAMPUS_JWT_SECRET` with a secret manager or cryptographically secure random generator; do not use the example placeholder. Mount the Firebase Admin SDK key outside the source checkout and do not upload it to Pages or commit it. `CAMPUS_JWT_EXPIRE_MINUTES` is optional and defaults to `480`.

Use durable storage for both SQLite files and ensure the two configured paths remain different. `CAMPUS_DEMO_DB_PATH` must never point to `CAMPUS_DB_PATH`: guest workflows and demo reset are intentionally isolated from operational records. Back up each database according to its separate data-retention policy. Do not place either database in the frontend, Git repository, or static build output.

For Firebase production, leave `CAMPUS_BOOTSTRAP_USERS` and `CAMPUS_API_KEYS` unset unless a separately controlled backend account/token workflow explicitly requires them. Firebase first sign-in provisions a least-privilege viewer; elevated roles must be assigned through the backend's authorized account-management process.

## Firebase and CORS setup

1. In Firebase Authentication, enable the providers used by the app and add the exact Pages hostname and any custom frontend hostname to **Authorized domains**.
2. Set `CAMPUS_CORS_ORIGINS` on the backend to those exact origins (scheme and host only; no path or wildcard). Include each production hostname that serves the app.
3. Confirm `VITE_API_BASE_URL` points to the HTTPS FastAPI origin and the backend permits that frontend origin.
4. Deploy the backend with persistent storage and the server-only Admin SDK credential available before enabling Firebase sign-in.

The app sends login, Firebase token exchange, guest-session, session validation, and application API requests through the same frontend API client and configured `VITE_API_BASE_URL`. Firebase's browser SDK also communicates directly with Firebase for identity operations.
