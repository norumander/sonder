# DECISIONS.md

## ADR Index

| # | Title | Status | Date |
|---|---|---|---|
| ADR-001 | Tech Stack Selection | Accepted | 2026-03-09 |
| ADR-002 | Separate Audio Channels Over Diarization | Accepted | 2026-03-09 |
| ADR-003 | Client-Side Face Analysis | Accepted | 2026-03-09 |
| ADR-004 | JSONB for Metric Snapshots | Accepted | 2026-03-09 |
| ADR-005 | Anonymous Student Join Flow | Accepted | 2026-03-09 |
| ADR-006 | Pre-Recorded Mode as Two Separate Files | Accepted | 2026-03-09 |
| ADR-007 | Two-Tier Monolith Over Domain Microservices | Accepted | 2026-03-10 |

---

## ADR-001: Tech Stack Selection

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: The PRD specifies the tech stack explicitly. This ADR documents the rationale and confirms alignment.
- **Decision**:
  - **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Recharts. Vite for fast HMR during development. TypeScript for type safety across complex real-time state (WebSocket messages, metric types, MediaPipe landmarks).
  - **Backend**: Python 3.11+ with FastAPI. FastAPI is async-native with built-in WebSocket support and auto-generated OpenAPI docs. Python gives direct access to the audio ML ecosystem (webrtcvad, librosa).
  - **Database**: PostgreSQL 15 with SQLAlchemy 2.0 (async) + Alembic. Matches Nerdy's existing stack. JSONB columns for flexible metric storage.
  - **Auth**: Google OAuth 2.0 via `@react-oauth/google` (frontend) and `google-auth` + `python-jose` JWT (backend).
  - **Testing**: Vitest + React Testing Library (frontend), pytest + pytest-asyncio (backend).
  - **Deployment**: Docker Compose for one-command setup.
- **Consequences**:
  - Positive: Aligns with PRD requirements and Nerdy's tech preferences. Well-documented libraries with strong community support.
  - Positive: Async FastAPI handles concurrent WebSocket connections efficiently.
  - Negative: Two-language stack (TypeScript + Python) adds context switching overhead.
  - Neutral: Docker Compose is dev-only; production deployment (ECS/Fargate) would need additional config.

---

## ADR-002: Separate Audio Channels Over Diarization

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: Identifying who is speaking is critical for talk time, interruption detection, and nudge rules. The two standard approaches are: (1) speaker diarization on a mixed audio stream, or (2) separate audio channels where each participant's browser captures their own microphone.
- **Decision**: Use separate audio channels. Each participant's browser captures their own microphone via `getUserMedia` and streams labeled audio chunks (`channel: "tutor"` or `channel: "student"`) to the backend. Speaker identity is known by channel label — no diarization needed.
- **Consequences**:
  - Positive: Higher accuracy (±5% vs ±10% for diarization). Speaker identity is deterministic, not probabilistic.
  - Positive: Simpler implementation — no speechbrain, pyannote, or other diarization libraries needed.
  - Positive: Lower server compute — VAD is lightweight compared to diarization models.
  - Negative: Requires both participants to open Sonder in a browser alongside their video call. If the student doesn't join, student audio metrics are unavailable.
  - Neutral: Single-file pre-recorded processing (stretch goal) would need diarization.

---

## ADR-003: Client-Side Face Analysis

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: Face landmark detection could run server-side (receive video frames, process centrally) or client-side (each browser runs MediaPipe locally).
- **Decision**: Run MediaPipe Face Mesh entirely in each participant's browser. Only computed metrics (eye contact score, facial energy) are sent to the server — no video frames cross the network.
- **Consequences**:
  - Positive: Eliminates video streaming bandwidth. Only small metric payloads sent via WebSocket.
  - Positive: No server GPU required. Scales to many concurrent sessions without compute bottleneck.
  - Positive: Privacy — raw video never leaves the participant's device.
  - Negative: Depends on client hardware. Minimum target is a 2020-era laptop with integrated GPU.
  - Negative: Cannot improve face analysis accuracy server-side without changing architecture.

---

## ADR-004: JSONB for Metric Snapshots

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: Metric snapshots contain multiple float/boolean fields that could change as metrics evolve. Options: (1) individual columns per metric, (2) JSONB column, (3) separate metric tables.
- **Decision**: Use a single JSONB `metrics` column on the MetricSnapshot table. Index on (session_id, timestamp_ms) for time-range queries.
- **Consequences**:
  - Positive: Schema flexibility — adding new metrics doesn't require migrations.
  - Positive: Single row per snapshot keeps queries simple.
  - Negative: Cannot create database-level indexes on individual metric values within JSONB (though GIN indexes are available if needed).
  - Neutral: Acceptable for the expected data volumes (1-2 snapshots/second × 60-minute sessions = ~7,200 rows per session max).

---

## ADR-005: Anonymous Student Join Flow

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: Students need to join sessions with minimal friction. Options: (1) require student accounts, (2) anonymous join with display name only.
- **Decision**: Students join anonymously via a 6-character join code or link. They provide a display name (1–50 characters, sanitized) but do not create accounts. A short-lived participant token (scoped to one session) authorizes the student's WebSocket connection.
- **Consequences**:
  - Positive: Zero-friction student experience — no sign-up, no login.
  - Positive: Simpler implementation — no student auth, profiles, or session history.
  - Negative: No student identity persistence across sessions. Cannot track a student's engagement over time.
  - Neutral: Aligns with PRD scope — student analytics are explicitly out of scope.

---

## ADR-006: Pre-Recorded Mode as Two Separate Files

- **Status**: Accepted
- **Date**: 2026-03-09
- **Context**: The PRD supports pre-recorded video analysis. Options: (1) accept a single combined video (gallery view) and use face isolation + diarization, or (2) require two separate files (one per participant).
- **Decision**: Core pre-recorded mode requires two separate video files — one for the tutor, one for the student. Each file is processed through the same MediaPipe + audio pipeline as live sessions. A timestamp offset parameter handles synchronization. Single-file processing is a stretch goal (Stretch #4) with acknowledged lower accuracy.
- **Consequences**:
  - Positive: Same pipeline for live and pre-recorded — no new ML models or complex face isolation logic.
  - Positive: High accuracy — same as live sessions since each file contains one participant.
  - Negative: Requires tutors to have separate recordings per participant, which may not always be available.
  - Neutral: The timestamp offset feature is simple to implement (shift one stream relative to the other).

---

## ADR-007: Two-Tier Monolith Over Domain Microservices

- **Status**: Accepted
- **Date**: 2026-03-10
- **Context**: The system could be organized as domain-vertical modules (`video-processor/`, `metrics-engine/`, `coaching-system/`, `analytics-dashboard/`) where each module owns its own frontend and backend code. The alternative is a two-tier monolith (`frontend/` + `backend/`) with domain modules nested inside each tier. This decision was evaluated after the initial implementation was complete.
- **Decision**: Two-tier monolith. The codebase is split into `frontend/` (React/TypeScript) and `backend/` (FastAPI/Python), each containing domain-specific subdirectories.
- **Rationale**:
  1. **Shared WebSocket connection**: Tutor and student each maintain a single WebSocket to the backend. That one connection carries audio chunks, face metrics, session control messages, nudges, and heartbeats. Splitting the backend into separate services would require either multiplexing across service boundaries or giving each client multiple connections — both add complexity with no benefit at this scale.
  2. **Tight metric pipeline coupling**: Audio analysis, face metrics, metric aggregation, and nudge evaluation all feed into a single per-second broadcast loop (`_broadcast_metrics`). The metrics engine needs audio VAD results *and* client face metrics *and* the nudge engine output in the same tick. Distributing these across services introduces network hops and synchronization overhead in a latency-sensitive pipeline.
  3. **Single database, single transaction boundary**: All five tables (Tutor, Session, MetricSnapshot, Nudge, SessionSummary) are queried and written together — ending a session persists the final snapshot, fires nudge evaluation, and triggers summary generation. A single DB connection pool keeps this simple and consistent.
  4. **Two-language boundary is the natural split**: Video/face analysis runs in the browser (TypeScript + MediaPipe WASM) because it avoids streaming video to the server. Audio/metric analysis runs in Python because of the ML ecosystem (webrtcvad, librosa). The frontend/backend boundary *is* the deployment boundary — there's no second axis to split on.
  5. **1:1 session scale**: The system supports exactly one tutor and one student per session. There's no fan-out, no pub/sub, no multi-tenant routing that would benefit from service isolation.
- **Module layout within this structure**:

  ```
  frontend/src/
  ├── media/          → Video/audio capture (getUserMedia, chunking)
  ├── metrics/        → Client-side face analysis (MediaPipe Face Mesh)
  ├── dashboard/      → Live tutor dashboard (metric cards, trends)
  ├── nudges/         → Coaching nudge toast display
  ├── analytics/      → Post-session summaries and cross-session trends
  ├── sessions/       → Session creation, join flow, lifecycle hooks
  ├── student/        → Student minimal UI
  ├── auth/           → Google OAuth, JWT, route guards
  ├── settings/       → Nudge threshold configuration
  └── shared/         → Types, config, WebSocket streaming hooks

  backend/app/
  ├── audio/          → WebRTC VAD, prosody extraction (per channel)
  ├── metrics/        → Metric aggregation, snapshot computation
  ├── nudges/         → Rule engine, cooldowns, nudge evaluation
  ├── summary/        → Post-session summary generation
  ├── trends/         → Cross-session trend aggregation API
  ├── websocket/      → Connection registry, message dispatch, broadcast loop
  ├── sessions/       → Session CRUD, join code validation
  ├── auth/           → Google OAuth verification, JWT, middleware
  ├── models/         → SQLAlchemy models, Alembic migrations
  └── preferences/    → Tutor nudge preference management
  ```

- **Mapping to domain verticals** (for reference):

  | Domain Concern | Frontend | Backend |
  |---|---|---|
  | Real-time video analysis | `metrics/`, `media/` | — (client-side only) |
  | Engagement metrics | `dashboard/`, `shared/useMetricsStreaming` | `audio/`, `metrics/`, `websocket/` |
  | Coaching suggestions | `nudges/` | `nudges/` |
  | Post-session reporting | `analytics/` | `summary/`, `trends/` |
  | Session management | `sessions/`, `student/`, `auth/` | `sessions/`, `auth/`, `websocket/` |

- **Consequences**:
  - Positive: Single deployment unit — one Docker Compose brings up the entire system. No inter-service networking, no service discovery, no distributed tracing.
  - Positive: Shared in-memory state (metric buffers, nudge cooldowns, connection registry) — no need for Redis or a message broker.
  - Positive: Simple debugging — a single backend process handles the full request lifecycle from WebSocket connect through metric broadcast to nudge delivery.
  - Negative: Cannot scale individual domains independently (e.g., scale audio processing without scaling WebSocket handling). Acceptable at 1:1 session scale.
  - Negative: Both tiers must be deployed together. No independent frontend/backend release cycle. Acceptable for a demo/evaluation build.
  - Neutral: If the system later needs multi-session concurrency at scale, the metrics pipeline could be extracted into a worker process behind a task queue — but that's a future concern, not a current requirement.
