
# VOLTAGE — AI Coding Agent Instructions

This file contains concise, actionable guidance for AI coding agents (Copilot-style) to be immediately productive in this repository.

**Big Picture**
- **Frontend:** Next.js 14 (App Router) lives in `app/` and `components/`. UI components follow the `components/ui/` (shadcn) pattern and pages use the App Router conventions (`app/layout.tsx`, `app/page.tsx`).
- **API surface:** Lightweight Next.js API routes are under `app/api/*/route.ts` (mock/demo data). A production-ready algorithm backend is implemented in Python FastAPI under `backend/` (see `backend/main.py`).
- **Data flow:** Frontend -> Next.js API routes (mock) OR Frontend -> Python API (http://localhost:8000). Use `NEXT_PUBLIC_API_URL` to switch targets.

**Developer workflows (important commands)**
- Install frontend deps: `npm install`
- Install Python deps: `pip install -r backend/requirements.txt` or `npm run install:python`
- Dev frontend: `npm run dev`
- Dev backend: `npm run backend` (uses `uvicorn main:app --reload --port 8000`)
- Dev both: `npm run dev:all` (uses `concurrently`)
- Build prod (SW generated): `npm run build` then `npm run start`
- Lint: `npm run lint`

**Project-specific conventions & patterns**
- File-based server routes: See `app/api/*/route.ts` — follow the same `route.ts` export shape for new endpoints.
- Auth & protection: Authentication helpers live in `lib/auth.ts` and global protection is in `middleware.ts`. Reuse `lib/auth.ts` patterns for JWT handling.
- UI components: Use `components/ui/*` primitives (variants & CVA) and prefer composition over duplication (see `button.tsx`, `input.tsx`).
- PWA: Service worker registration lives in `components/register-sw.tsx`; PWA is disabled in `next dev` — test via `npm run build` + `npm run start`.

**Backend patterns**
- FastAPI app with Pydantic models in `backend/main.py`. Algorithm modules live in `backend/` (`anomaly_detection.py`, `bghi_calculator.py`, `forecasting.py`).
- Many endpoints currently return mocked data — look for `# TODO` comments in `backend/main.py` to find where to wire DB, model loading, and real logic.
- CORS is configured for `http://localhost:3000` — if changing ports, update `backend/main.py`.

**Integration points & env/config**
- Use `NEXT_PUBLIC_API_URL` to point frontend to the FastAPI backend (default in README: `http://localhost:8000`).
- Scripts in `package.json`: `backend`, `backend:prod`, `dev:all` (concurrently). Adjust if integrating with container orchestration.

**Files to inspect for examples / entry points**
- Frontend: `app/api/login/route.ts`, `app/layout.tsx`, `app/page.tsx`, `components/dashboard-layout.tsx`, `components/register-sw.tsx`.
- Auth & utils: `lib/auth.ts`, `lib/utils.ts`, `lib/mock-data.ts`.
- Backend: `backend/main.py`, `backend/anomaly_detection.py`, `backend/bghi_calculator.py`, `backend/forecasting.py`.

**When making changes**
- Preserve `app/api/*` route signatures (these are consumed by frontend pages).
- Keep frontend mocks intact unless replacing with backend endpoints; update `NEXT_PUBLIC_API_URL` and the calling code.
- If you add runtime caching changes, update `next.config.js` where `@ducanh2912/next-pwa` options live.

**Debugging tips**
- Frontend logs: run `npm run dev` and watch terminal + browser console.
- Backend logs: run `npm run backend` (uvicorn) and use the `/api/health` and `/docs` endpoints.
- Many backend TODOs return mock data — use `/api/bghi/{zone_id}` and `/api/forecast/{zone_id}` to inspect current JSON shape expected by the frontend.

If any of these areas are unclear or you want more examples (e.g., exact API JSON shapes or test harnesses), tell me which part to expand and I will iterate.

