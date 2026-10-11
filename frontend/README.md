# CampusLuma Frontend

CampusLuma is an **AI-Powered Student Success Intelligence** workspace.

**Illuminate Student Success.**

Built for the KPMG India Smart Campus Analytics Challenge.

## Run locally

From this directory in PowerShell:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Configure the Vite API URL and authentication mode using the existing `VITE_*` environment settings described in the repository [setup guide](../README.md). Keep those setting names unchanged.

For production validation, run `npx.cmd tsc --noEmit` and `npm.cmd run build` from this directory.
# CampusLuma frontend

Run the development server from this directory with `npm run dev`. The Vite proxy forwards `/api` requests to FastAPI at `http://127.0.0.1:8000`.

Available verification commands:

```powershell
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run lint
npm.cmd run test:e2e
```

The browser suite expects FastAPI and Vite at ports 8000 and 5173. It uses Playwright's installed Chromium by default. To use an installed Chrome executable, set `PLAYWRIGHT_CHROME_PATH` to its full path before running the suite.
