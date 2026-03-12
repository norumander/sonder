# ARCHITECTURE.md

## Overview

Sonder is a browser-based companion app for live 1:1 video tutoring sessions. Both tutor and student connect their webcams and microphones through separate browser tabs. Each browser runs client-side face analysis (MediaPipe Face Mesh) on its own webcam feed and streams computed visual metrics plus raw audio to a shared FastAPI backend. The backend performs audio analysis (VAD, prosody) on labeled per-participant channels, computes composite engagement metrics, evaluates coaching nudge rules, and pushes results to the tutor's dashboard in real time via WebSocket. Post-session, the backend generates analytics summaries with trend tracking. The system also supports processing two pre-recorded video files (one per participant) through the same pipeline.

## System Diagram

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│       TUTOR BROWSER                 │     │       STUDENT BROWSER               │
│                                     │     │                                     │
│  ┌───────────┐  ┌────────────────┐  │     │  ┌───────────┐  ┌────────────────┐  │
│  │ getUserMedia│  │ MediaPipe Face │  │     │  │ getUserMedia│  │ MediaPipe Face │  │
│  │ (cam+mic) │  │ Mesh (WASM)   │  │     │  │ (cam+mic) │  │ Mesh (WASM)   │  │
│  └─────┬─────┘  └───────┬────────┘  │     │  └─────┬─────┘  └───────┬────────┘  │
│        │                │            │     │        │                │            │
│        ▼                ▼            │     │        ▼                ▼            │
│  ┌──────────────────────────────┐   │     │  ┌──────────────────────────────┐   │
│  │  Client Metrics Engine       │   │     │  │  Client Metrics Engine       │   │
│  │  (eye contact, facial energy)│   │     │  │  (eye contact, facial energy)│   │
│  └──────────────┬───────────────┘   │     │  └──────────────┬───────────────┘   │
│                 │                    │     │                 │                    │
│  ┌──────────────▼───────────────┐   │     │  ┌──────────────▼───────────────┐   │
│  │  WebSocket Client            │   │     │  │  WebSocket Client            │   │
│  │  (audio chunks + metrics)    │   │     │  │  (audio chunks + metrics)    │   │
│  └──────────────┬───────────────┘   │     │  └──────────────┬───────────────┘   │
│                 │                    │     │                 │                    │
│  ┌──────────────────────────────┐   │     │  ┌──────────────────────────────┐   │
│  │  Tutor UI                    │   │     │  │  Student UI                  │   │
│  │  - Live Dashboard (both)     │   │     │  │  - Webcam preview            │   │
│  │  - Nudge Toasts              │   │     │  │  - "Session active"          │   │
│  │  - Analytics / Trends        │   │     │  │  - "Leave session" button    │   │
│  │  - Settings                  │   │     │  │  - No metrics/nudges         │   │
│  └──────────────────────────────┘   │     │  └──────────────────────────────┘   │
└─────────────────┬───────────────────┘     └─────────────────┬───────────────────┘
                  │ WS (role="tutor")                         │ WS (role="student")
                  │                                           │
                  ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            FASTAPI BACKEND                                     │
│                                                                                 │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐                   │
│  │ Auth Module  │  │ Session Manager  │  │ WebSocket Handler│                   │
│  │ (OAuth+JWT) │  │ (CRUD+lifecycle) │  │ (2 conn/session) │                   │
│  └─────────────┘  └──────────────────┘  └────────┬─────────┘                   │
│                                                   │                             │
│                          ┌────────────────────────┼────────────────────┐        │
│                          ▼                        ▼                    ▼        │
│               ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│               │ Audio Analyzer   │  │ Metrics Engine   │  │ Nudge Engine   │   │
│               │ - WebRTC VAD     │  │ - Talk time      │  │ - Rule eval    │   │
│               │ - Prosody/librosa│  │ - Interruptions  │  │ - Cooldowns    │   │
│               │ (per channel)    │  │ - Energy (combo) │  │ - Queue mgmt   │   │
│               └──────────────────┘  │ - Attn drift     │  └────────────────┘   │
│                                     └──────────────────┘                        │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Summary Generator │  │ Trends API       │  │ REST API         │              │
│  │ (post-session)    │  │ (cross-session)  │  │ (sessions, auth) │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
│                                                                                 │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │     POSTGRESQL 15      │
                          │                        │
                          │  - Tutor (preferences) │
                          │  - Session (join_code) │
                          │  - MetricSnapshot (JSONB)│
                          │  - Nudge (delivery log)│
                          │  - SessionSummary      │
                          └───────────────────────┘
```

## Components

### Frontend — Auth Module
- **Responsibility**: Google OAuth login flow, JWT token management, route protection
- **Location**: `frontend/src/auth/`
- **Interfaces**: `useAuth()` hook, `<ProtectedRoute>` component, token storage
- **Dependencies**: `@react-oauth/google`, backend `/auth/*` endpoints

### Frontend — Session Management
- **Responsibility**: Create sessions, display join code/link, join flow for students
- **Location**: `frontend/src/sessions/`
- **Interfaces**: `useSession()` hook, session creation form, join page
- **Dependencies**: Auth module, backend `/sessions/*` endpoints

### Frontend — Media Capture
- **Responsibility**: Webcam and microphone access via `getUserMedia`, permission handling, audio chunking
- **Location**: `frontend/src/media/`
- **Interfaces**: `useMediaCapture()` hook providing video stream, audio chunks, permission state
- **Dependencies**: Browser MediaDevices API

### Frontend — Client Metrics Engine
- **Responsibility**: MediaPipe Face Mesh initialization, eye contact score computation, facial energy extraction
- **Location**: `frontend/src/metrics/`
- **Interfaces**: `useFaceMesh()` hook, `computeEyeContact(landmarks)`, `computeFacialEnergy(landmarks)`
- **Dependencies**: `@mediapipe/tasks-vision`, Media Capture module

### Frontend — Dashboard
- **Responsibility**: Live metrics display for both participants, color-coded status, trend arrows
- **Location**: `frontend/src/dashboard/`
- **Interfaces**: `<LiveDashboard>` component tree, metric card components
- **Dependencies**: WebSocket messages (server_metrics type), Recharts

### Frontend — Nudge Display
- **Responsibility**: Non-intrusive toast notifications for coaching nudges, queue management
- **Location**: `frontend/src/nudges/`
- **Interfaces**: `<NudgeToast>` component, nudge queue state
- **Dependencies**: WebSocket messages (nudge type)

### Frontend — Analytics
- **Responsibility**: Post-session summary view, session list, timeline charts, cross-session trends
- **Location**: `frontend/src/analytics/`
- **Interfaces**: Session list page, summary detail page, trends chart page
- **Dependencies**: Backend `/sessions/*/summary`, `/tutor/trends` endpoints, Recharts

### Frontend — Settings
- **Responsibility**: Nudge threshold configuration, enable/disable nudge types
- **Location**: `frontend/src/settings/`
- **Interfaces**: Settings form, `usePreferences()` hook
- **Dependencies**: Backend `/tutor/preferences` endpoint

### Frontend — Student View
- **Responsibility**: Minimal student experience — webcam preview, session status, leave button
- **Location**: `frontend/src/student/`
- **Interfaces**: `<StudentSession>` page component
- **Dependencies**: Media Capture module, Client Metrics Engine, WebSocket

### Backend — Auth Module
- **Responsibility**: Google OAuth token verification, JWT creation/validation, auth middleware
- **Location**: `backend/app/auth/`
- **Interfaces**: `/auth/google` endpoint, `/auth/me` endpoint, `get_current_tutor` dependency
- **Dependencies**: `google-auth`, `python-jose`, Tutor model

### Backend — Session API
- **Responsibility**: Session CRUD, join flow with code validation, participant token generation
- **Location**: `backend/app/sessions/`
- **Interfaces**: REST endpoints per API contract (POST, GET, PATCH /sessions/*)
- **Dependencies**: Auth module, Session model, database

### Backend — WebSocket Handler
- **Responsibility**: Manage two WebSocket connections per session (tutor + student), message routing, heartbeat
- **Location**: `backend/app/websocket/`
- **Interfaces**: `WS /ws/session/{session_id}`, connection registry, message dispatcher
- **Dependencies**: Auth module (token validation), Session model

### Backend — Audio Analyzer
- **Responsibility**: WebRTC VAD per channel, prosody feature extraction (pitch, volume, speech rate)
- **Location**: `backend/app/audio/`
- **Interfaces**: `analyze_audio_chunk(channel, pcm_data)` → VAD result + prosody features
- **Dependencies**: `webrtcvad`, `librosa`, `numpy`

### Backend — Metrics Engine
- **Responsibility**: Compute server-side metrics: talk time balance, interruption detection, energy (combined), attention drift
- **Location**: `backend/app/metrics/`
- **Interfaces**: `MetricsEngine` class managing per-session metric state, snapshot persistence
- **Dependencies**: Audio Analyzer, client metrics (via WebSocket), MetricSnapshot model

### Backend — Nudge Engine
- **Responsibility**: Evaluate nudge rules against combined metrics, manage cooldowns, emit nudge events
- **Location**: `backend/app/nudges/`
- **Interfaces**: `NudgeEngine.evaluate(metrics, preferences)` → list of triggered nudges
- **Dependencies**: Metrics Engine, Tutor preferences, Nudge model

### Backend — Summary Generator
- **Responsibility**: Compute post-session summary (averages, flagged moments, recommendations)
- **Location**: `backend/app/summary/`
- **Interfaces**: `generate_summary(session_id)` → SessionSummary
- **Dependencies**: MetricSnapshot model, Nudge model, SessionSummary model

### Backend — Trends API
- **Responsibility**: Aggregate metric averages across sessions for trend charts
- **Location**: `backend/app/trends/`
- **Interfaces**: `GET /tutor/trends` endpoint
- **Dependencies**: SessionSummary model, Auth module

### Database Layer
- **Responsibility**: SQLAlchemy models, Alembic migrations, async session management
- **Location**: `backend/app/models/`, `backend/alembic/`
- **Interfaces**: SQLAlchemy models (Tutor, Session, MetricSnapshot, Nudge, SessionSummary), async session factory
- **Dependencies**: `sqlalchemy[asyncio]`, `asyncpg`, `alembic`

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend Language | TypeScript | Type safety for complex real-time state |
| Frontend Framework | React 18 + Vite | Fast HMR, no SSR complexity |
| CSS | Tailwind CSS | Utility-first, rapid iteration |
| Charts | Recharts | React-native, lightweight |
| Client ML | MediaPipe Face Mesh (JS) | Browser-native, 468 landmarks, no server load |
| Backend Language | Python 3.11+ | ML ecosystem access (audio analysis) |
| Backend Framework | FastAPI | Async-native, WebSocket support, auto OpenAPI |
| Database | PostgreSQL 15 | JSONB for flexible metrics, matches Nerdy stack |
| ORM | SQLAlchemy 2.0 + Alembic | Async support, migration management |
| Audio Analysis | webrtcvad + librosa | VAD per channel, prosody features |
| Auth | Google OAuth 2.0 | Tutor accounts; students join anonymously |
| Auth Tokens | python-jose (JWT) | Stateless auth for API + WebSocket |
| Frontend Auth | @react-oauth/google | Google sign-in button + token flow |
| Test (Frontend) | Vitest + React Testing Library | Vite-native, Jest-compatible API |
| Test (Backend) | pytest + pytest-asyncio | Async test support for FastAPI |
| Deployment (dev) | Docker Compose | One-command local: PostgreSQL + FastAPI + Vite |
| Deployment (prod) | Railway | Auto-deploy on push to main; separate services per Dockerfile |

## Data Models

### Entity Relationships

```
Tutor (1) ──────< Session (many)
                    │
                    ├──< MetricSnapshot (many)
                    ├──< Nudge (many)
                    └──── SessionSummary (one)
```

### Tutor
- `id`: UUID (PK)
- `google_id`: string (unique)
- `name`: string
- `email`: string
- `avatar_url`: string (nullable)
- `preferences`: JSONB (nudge thresholds, enabled types)
- `created_at`, `updated_at`: timestamp

### Session
- `id`: UUID (PK)
- `tutor_id`: UUID (FK → Tutor)
- `join_code`: string(6) (unique, indexed)
- `status`: enum ("waiting", "active", "completed")
- `session_type`: enum ("live", "pre_recorded")
- `student_display_name`: string (nullable)
- `subject`: string (nullable)
- `session_type_label`: string (nullable)
- `start_time`: timestamp
- `join_time`: timestamp (nullable)
- `end_time`: timestamp (nullable)
- `created_at`: timestamp

### MetricSnapshot
- `id`: UUID (PK)
- `session_id`: UUID (FK → Session, indexed)
- `timestamp_ms`: integer (relative to session start)
- `metrics`: JSONB containing:
  - `tutor_eye_contact`: float
  - `student_eye_contact`: float (nullable)
  - `tutor_talk_pct`: float
  - `student_talk_pct`: float
  - `interruption_count`: integer (cumulative)
  - `tutor_energy`: float
  - `student_energy`: float (nullable)
  - `tutor_attention_drift`: boolean
  - `student_attention_drift`: boolean (nullable)
  - `drift_reason`: string (nullable)
- Index: (session_id, timestamp_ms)

### Nudge
- `id`: UUID (PK)
- `session_id`: UUID (FK → Session)
- `timestamp_ms`: integer
- `nudge_type`: enum ("student_silent", "student_low_eye_contact", "tutor_dominant", "student_energy_drop", "interruption_spike", "tutor_low_eye_contact")
- `message`: string
- `priority`: enum ("low", "medium", "high")
- `trigger_metrics`: JSONB

### SessionSummary
- `id`: UUID (PK)
- `session_id`: UUID (FK → Session, unique)
- `tutor_metrics`: JSONB (avg/min/max per metric)
- `student_metrics`: JSONB (avg/min/max per metric)
- `talk_time_ratio`: JSONB ({tutor_pct, student_pct})
- `total_interruptions`: integer
- `interruption_attribution`: JSONB ({tutor_count, student_count})
- `flagged_moments`: JSONB array
- `recommendations`: JSONB array (2–4 strings)
- `overall_engagement_score`: float (0–100)

## Deployment

### Production — Railway

The application is deployed on [Railway](https://railway.app) as two separate services, each auto-deployed on push to `main`:

| Service | Dockerfile | Port | Notes |
|---------|-----------|------|-------|
| Backend | `backend/Dockerfile` | 8000 | Runs Alembic migrations via `entrypoint.sh` before starting uvicorn |
| Frontend | `frontend/Dockerfile.prod` | 80 | Multi-stage build: Vite → nginx:alpine with `nginx.railway.conf` |

**Database**: Railway-managed PostgreSQL instance. Connection string provided via `DATABASE_URL` environment variable.

**Build args** (set in Railway service settings):
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID (baked into frontend at build time)
- `VITE_API_URL` — Backend URL (baked into frontend at build time)

**Environment variables** (set per service in Railway):
- Backend: `SONDER_DATABASE_URL`, `SONDER_JWT_SECRET`, `SONDER_GOOGLE_CLIENT_ID`, `SONDER_CORS_ORIGINS`
- Frontend: Build args only (static SPA served by nginx)

**Deployment flow**: Push to `main` → Railway detects Dockerfiles → builds and deploys both services automatically.

### Local Development — Docker Compose

```bash
docker compose up        # dev: hot reload, port 5173 (frontend) + 8000 (backend)
docker compose -f docker-compose.prod.yml up  # prod-like: nginx on port 8080
```

## Boundaries & Constraints

- **Desktop browsers only** — Chrome and Firefox on desktop. No mobile support.
- **1:1 sessions only** — Exactly one tutor and one student per session (MVP).
- **No raw media storage** — Only metric time-series and summaries are persisted. No video/audio saved.
- **No speaker diarization** — Separate audio channels per participant eliminate this need.
- **Client-side ML** — MediaPipe runs in each participant's browser; server never processes video.
- **Google OAuth required** — Tutors must have Google accounts. Students join anonymously.
- **No production security hardening** — Demo/evaluation build. No rate limiting, CSRF, etc.
- **Pre-recorded mode requires two files** — One per participant. Single-file processing is stretch only.
- **Environment variables for all secrets** — Google OAuth credentials, JWT secret, DB connection string.

## Directory Structure

```
sonder/
├── frontend/
│   ├── src/
│   │   ├── auth/           # OAuth login, JWT management, route guards
│   │   ├── sessions/       # Session creation, join flow
│   │   ├── media/          # getUserMedia, audio chunking
│   │   ├── metrics/        # MediaPipe Face Mesh, eye contact, facial energy
│   │   ├── dashboard/      # Live metrics dashboard (tutor)
│   │   ├── nudges/         # Nudge toast display
│   │   ├── analytics/      # Post-session summary, trends
│   │   ├── settings/       # Nudge configuration
│   │   ├── student/        # Student minimal UI
│   │   ├── shared/         # Shared types, API client, WebSocket hook
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── Dockerfile              # Dev container
│   ├── Dockerfile.prod         # Production: multi-stage Vite build → nginx:alpine
│   ├── nginx.railway.conf      # SPA nginx config for Railway deployment
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/
│   ├── app/
│   │   ├── auth/           # OAuth verification, JWT, middleware
│   │   ├── sessions/       # Session CRUD, join flow
│   │   ├── websocket/      # WS connection manager, message routing
│   │   ├── audio/          # WebRTC VAD, prosody analysis
│   │   ├── metrics/        # Server-side metric computation
│   │   ├── nudges/         # Nudge rule engine
│   │   ├── summary/        # Post-session summary generation
│   │   ├── trends/         # Cross-session trend aggregation
│   │   ├── models/         # SQLAlchemy models
│   │   ├── config.py       # Environment-based configuration
│   │   ├── database.py     # Async DB session management
│   │   └── main.py         # FastAPI app entry point
│   ├── alembic/            # Database migrations
│   ├── Dockerfile              # Python 3.11 slim + system deps (ffmpeg, libsndfile)
│   ├── entrypoint.sh           # Runs Alembic migrations before app start
│   ├── alembic.ini
│   ├── requirements.txt
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       ├── test_sessions.py
│       ├── test_metrics.py
│       ├── test_nudges.py
│       ├── test_audio.py
│       └── test_summary.py
├── docker-compose.yml          # Local dev: PostgreSQL + backend + frontend
├── docker-compose.prod.yml     # Production-like local build (nginx on :8080)
├── nginx.conf                  # Reverse proxy config for prod compose
├── .env.example
├── CLAUDE.md
├── PRD.md
├── ARCHITECTURE.md
├── IMPLEMENTATION.md
├── DECISIONS.md
└── TESTING.md
```
