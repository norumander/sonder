# PRD.md — Sonder

> **Development Methodology**: This project is built using agentic development (Claude Code).
> All requirements must be unambiguous and testable by automated tests.
> The agent follows strict TDD, makes atomic commits, and uses the CLAUDE.md bootstrap protocol.
> If a requirement can't be verified with a test, the agent can't know when to stop.

## Project Name

sonder

## One-Liner

A browser-based companion app for live video tutoring sessions where both tutor and student connect their webcams, enabling real-time AI-powered engagement analysis, coaching nudges, and post-session analytics.

## Problem Statement

Live tutoring sessions are the highest-value interaction on the Varsity Tutors platform, but tutors receive zero real-time feedback on their teaching effectiveness. Engagement signals — eye contact, talk time balance, interruption patterns, energy levels, and attention drift — are strong predictors of session quality but are completely invisible during the session itself.

Tutors only learn what went wrong after the fact (if at all), and there is no systematic way to improve session-over-session. This gap affects learner outcomes, tutor retention, and platform quality metrics.

Sonder solves this by having both tutor and student connect to a lightweight web app alongside their video call. Each participant's browser captures their own webcam and microphone, streams data to a shared backend, and the system analyzes both participants' engagement in real time. The tutor sees a live dashboard with engagement metrics for both participants and receives non-intrusive coaching nudges. The student's experience is minimal — they click a join link, grant camera/mic access, and that's it. After the session, the tutor gets analytics dashboards with trend tracking and personalized improvement recommendations.

Because each participant runs face analysis on their own high-quality webcam feed and captures their own isolated audio, the system achieves high accuracy without speaker diarization, screen capture, or any coupling to the video call platform.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language (Frontend) | TypeScript | Type safety for complex real-time state management |
| Language (Backend) | Python 3.11+ | Direct access to audio ML ecosystem (WebRTC VAD, prosody analysis) |
| Frontend Framework | React 18 + Vite | Fast dev server, no SSR complexity. Vite for sub-second HMR |
| Backend Framework | FastAPI | Async-native, WebSocket support, auto-generated OpenAPI docs |
| Database | PostgreSQL 15 | Matches Nerdy stack. JSONB for flexible metric snapshots |
| ORM | SQLAlchemy 2.0 + Alembic | Async support, migration management |
| Real-time Transport | WebSocket (FastAPI native) | Bidirectional metrics/nudge transport. Two clients per session (tutor + student) |
| Video ML (Client) | MediaPipe Face Mesh (JS) | Runs entirely in each participant's browser. 468 face landmarks, gaze estimation |
| Audio Analysis (Server) | WebRTC VAD + librosa | Voice activity detection per channel, prosody analysis. No diarization needed — speakers identified by connection. Add speechbrain only if Stretch #4 is built |
| Auth | Google OAuth 2.0 (react-oauth/google + FastAPI) | Tutor accounts only. Students join anonymously via session link/code |
| Test Framework (Frontend) | Vitest + React Testing Library | Vite-native, fast, compatible with Jest API |
| Test Framework (Backend) | pytest + pytest-asyncio | Async test support for FastAPI |
| Build/Deploy | Docker Compose | One-command setup: PostgreSQL + FastAPI + Vite dev server |
| Charting | Recharts | React-native charting for dashboards, lightweight |
| CSS | Tailwind CSS | Utility-first, fast iteration, no design system overhead |

## Requirements

### Core (MVP — must ship)

1. **Google OAuth Login (Tutor)**: Tutor can sign in with a Google account. The app creates a Tutor record on first login and loads existing preferences on subsequent logins. Unauthenticated users are redirected to the login page. A valid JWT is required for all tutor API calls and WebSocket connections. Test: POST `/auth/google` with a valid Google token returns a JWT and creates a Tutor record; requests without a valid JWT return 401.

2. **Session Creation & Join Flow**: Tutor creates a session from their dashboard, which generates a unique session ID, a 6-character alphanumeric join code, and a join URL containing the code (e.g., `/join/ABC123`). The tutor sees both the link and the code on their session screen. A student can join by clicking the link or by navigating to the app and entering the code manually. On join, the student provides a display name (required, 1–50 characters) and grants webcam/mic permissions. No account creation required for students. The session transitions to "active" once both tutor and student are connected. Test: Creating a session returns a session_id and 6-character join code; a student joining with a valid code and display name transitions the session to "active"; an invalid code returns 404; a session that already has a student connected rejects additional joins with 409.

3. **Tutor Webcam & Audio Capture**: When the session is active, the tutor's browser captures webcam video via `getUserMedia`, initializes MediaPipe Face Mesh, and begins processing frames. Audio is captured from the tutor's microphone and streamed to the backend over WebSocket as labeled 1-second chunks (`channel: "tutor"`). The tutor sees a small preview of their own webcam with face landmark overlay. If webcam access is denied, the app displays an error and does not start the session. If microphone is denied, the session starts in video-only mode with audio metrics disabled for the tutor. Test: Given a mock video source, the face mesh pipeline emits landmark data within 2 seconds; audio chunks labeled "tutor" arrive at the backend at 1-second intervals; webcam denial renders an error; mic denial starts video-only mode with a visible indicator.

4. **Student Webcam & Audio Capture**: When the student joins, their browser captures webcam video via `getUserMedia`, initializes MediaPipe Face Mesh, and streams computed metrics (eye contact score, facial energy) to the backend over WebSocket. Audio is captured from the student's microphone and streamed as labeled 1-second chunks (`channel: "student"`). The student sees a minimal UI: their own webcam preview, a "Session active" indicator, and a "Leave session" button. No metrics, nudges, or dashboard are shown to the student. If the student denies webcam, the student's visual metrics are unavailable (backend marks them as null). If mic is denied, the student's audio metrics are unavailable. Test: Student client streams client_metrics and audio chunks labeled "student" to the backend; the student UI does not render any metrics or nudge components; webcam denial results in null visual metrics on the backend.

5. **Eye Contact / Gaze Metric (Client-Side, Both Participants)**: Using MediaPipe Face Mesh landmarks, calculate an eye contact score (0.0–1.0) for each participant representing the percentage of time they are looking at their camera/screen. Update the score every 500ms. The calculation uses iris landmark positions relative to eye boundary landmarks. Each participant's browser computes their own score and sends it to the backend. Test: Given a synthetic landmark stream where the iris is centered (looking at camera), the eye contact score is ≥0.8; given a stream where the iris is at the eye boundary (looking away), the score is ≤0.3. Both tutor and student scores are received and stored as separate fields.

6. **Speaking Time Balance Metric (Server-Side)**: Using WebRTC VAD applied independently to the tutor and student audio channels, calculate each participant's talk time as a running percentage. Since each channel contains only one speaker (identity known by channel label), no diarization is needed. Update the metric every 2 seconds. Test: Given two separate test audio channels where the tutor speaks for 60% and the student for 40% of elapsed time, the computed ratios are within ±5% of ground truth.

7. **Interruption Detection Metric (Server-Side)**: Detect overlapping speech by cross-referencing VAD output from the tutor and student audio channels. An interruption is counted when both channels show active speech for >300ms simultaneously. The interrupter is the speaker whose channel activated second. Update the count in real time. Test: Given two test audio channels with 3 known overlapping speech segments (each >300ms), the detector reports 3 ±1 interruptions with correct attribution.

8. **Energy Level Metric (Server-Side + Client-Side, Both Participants)**: Compute an energy score (0.0–1.0) for each participant combining voice prosody features (pitch variation, volume variation, speech rate) from their audio channel and facial expression valence from their MediaPipe analysis. Weight voice at 0.6 and facial at 0.4. Update every 2 seconds. Test: Given a monotone, low-volume audio sample paired with neutral facial landmarks, energy score is ≤0.3; given an animated, varied-pitch audio sample with expressive landmarks, energy score is ≥0.7. Both tutor and student energy scores are computed and stored separately.

9. **Attention Drift Detection (Composite Metric, Both Participants)**: Compute an attention drift flag for each participant when: their eye contact score drops below 0.3 for >15 consecutive seconds, OR their energy score drops by >0.3 from their rolling 2-minute average. The flag includes the participant role ("tutor" or "student") and the trigger reason. Test: Given a student metric stream where eye contact is 0.2 for 20 consecutive seconds, the drift flag activates for the student with reason "low_eye_contact"; the same conditions for the tutor activate the tutor's drift flag independently.

10. **Real-Time Metrics Dashboard (Tutor-Only)**: Display engagement metrics for both participants in a live-updating dashboard visible only to the tutor. The dashboard shows: a side-by-side or stacked layout with tutor metrics and student metrics, each displaying current value, trend arrow (improving/declining/stable over last 2 minutes), and color-coded status (green/yellow/red based on configurable thresholds). A combined "session engagement" score is displayed as a weighted average. Metrics update visually at ≥1 Hz. Test: Given a WebSocket stream of metric updates at 1 Hz for both participants, the dashboard renders updated values within 200ms of receipt; tutor and student metrics are displayed in separate labeled sections; the student's browser does not render any dashboard components.

11. **Coaching Nudge Engine (Tutor-Only)**: Generate coaching nudges based on metric thresholds, using both tutor and student metrics. Minimum nudge rules: (a) student silent >3 minutes → "Check for understanding", (b) student eye contact <0.3 for >30s → "Student may be distracted", (c) tutor talk time >80% for >5 minutes → "Try asking a question", (d) student energy drop >30% → "Consider a short break or change approach", (e) 3+ interruptions in 2 minutes → "Give more wait time", (f) tutor eye contact <0.3 for >30s → "Try making more eye contact". Nudges appear as non-intrusive toasts on the tutor's screen only, auto-dismiss after 8 seconds, queued (max 1 visible at a time). A minimum 60-second cooldown between nudges of the same type. Nudges are never shown to the student. Test: Given a metric stream where the student is silent for 3+ minutes, a nudge with text "Check for understanding" appears on the tutor's screen within 2 seconds and does not appear on the student's screen; a second trigger within 60 seconds does not produce a duplicate nudge.

12. **Nudge Configuration (Tutor)**: Tutors can configure nudge sensitivity (thresholds) and enable/disable individual nudge types via a settings panel. Settings persist to the Tutor record in the database. Default thresholds are pre-populated on first login. Test: Changing the "student silent" threshold from 3 to 5 minutes and reloading the page persists the change; disabling a nudge type prevents that nudge from firing.

13. **Session Lifecycle Management**: A session starts when the tutor clicks "Start Session." The session transitions to "active" when the student joins. The session ends when: the tutor clicks "End Session," the tutor closes their browser tab (beforeunload handler), OR the student disconnects and does not reconnect within 30 seconds. When a session ends, both participants see a "Session ended" screen. Start time, end time, join time, and context are persisted. The session has a unique ID used to correlate all metrics and nudges from both participants. Test: Starting a session creates a Session record with status "waiting"; student joining sets status to "active" and records join_time; ending a session sets end_time and status "completed"; metric snapshots from both participants reference the correct session_id.

14. **Post-Session Summary Generation**: When a session ends, the backend computes a summary: average and min/max for each metric for both participants, total interruptions (attributed by speaker), talk time ratio, a list of flagged moments (timestamps where either participant's attention drift was triggered or nudges fired), and 2–4 personalized text recommendations based on the session's weakest metrics. The summary is stored and accessible via API. Test: After ending a session with known metric data for both participants, the GET `/sessions/{id}/summary` endpoint returns a summary with tutor and student metric sections; recommendations array has 2–4 items; flagged moments include the participant role.

15. **Post-Session Analytics Dashboard (Tutor-Only)**: A page listing all past sessions for the logged-in tutor, sorted by date descending. Clicking a session shows the full summary, a timeline chart of engagement metrics for both participants over the session duration, and the list of nudges that were delivered. Test: Given 3 completed sessions in the database, the sessions list page renders 3 rows; clicking a row renders the summary view with separate tutor and student metric series in the timeline chart.

16. **Cross-Session Trend Analysis (Tutor-Only)**: The analytics dashboard includes a trends view showing metric averages across the last 10 sessions as a line chart. Tutor self-metrics and student metrics are shown as separate series. If fewer than 2 sessions exist, the trends view shows a message "Complete more sessions to see trends." Test: Given 5 sessions with known average metrics for both participants, the trends chart renders 5 data points per metric series; with 1 session, the empty-state message is displayed.

17. **Pre-Recorded Video File Input (Two Files)**: In addition to live sessions, the tutor can upload two separate pre-recorded video files (mp4, webm) — one for the tutor and one for the student (e.g., separate screen recordings from each participant's perspective). The tutor specifies a timestamp offset if the recordings are not synchronized (default 0). Each file is processed through the same MediaPipe Face Mesh and audio pipeline used for live sessions — the tutor file feeds the tutor metrics, the student file feeds the student metrics. Processing runs at real-time speed (1x) or accelerated speed (up to 4x). Test: Given two 60-second test video files (one per participant), processing at 2x speed completes in ≤35 seconds and produces metric snapshots for both participants covering the full video duration; a 5-second timestamp offset correctly shifts one participant's metrics relative to the other.

18. **Graceful Degradation on Poor Input**: If a participant's face detection fails for >5 consecutive seconds, the dashboard shows a "[Role] face not detected" warning and excludes their visual metrics from nudge calculations until detection resumes. If a participant's audio channel has no voice activity for >60 seconds (not silence due to not speaking, but audio stream absent or corrupt), their audio metrics show "[Role] audio unavailable." If the student disconnects mid-session, their metrics freeze at last known values and a "Student disconnected" indicator appears. Test: Given a tutor video stream with no detectable face, "Tutor face not detected" appears within 6 seconds; given a student disconnect, "Student disconnected" appears and metrics freeze; student reconnection within 30 seconds resumes metric updates.

19. **Docker Compose One-Command Setup**: The entire stack (PostgreSQL, FastAPI backend, Vite dev server) runs via `docker-compose up`. A seed script creates database tables on first run. A README documents: prerequisites (Docker, Docker Compose), setup command, how to access the tutor app and student join flow, and how to configure Google OAuth credentials. Test: Running `docker-compose up --build` from a clean clone results in the app accessible at `http://localhost:5173` and the API at `http://localhost:8000/docs` within 120 seconds.

### Stretch (nice to have)

1. **Multi-Participant Group Session Support**: Support 2+ students joining the same session. Each student's browser captures independently. The tutor dashboard shows per-student metrics. Nudge rules adapt (e.g., "Student 2 hasn't spoken in 5 minutes"). Session join allows multiple students until a tutor-configured cap (default 5).

2. **Video Playback of Flagged Moments**: For pre-recorded video sessions, allow the tutor to click a flagged moment in the post-session timeline and play back the video starting 10 seconds before the flag. Video segments are stored as references (start/end timestamps) to the original file, not as copies.

3. **Novel Engagement Metrics**: Implement 1–2 engagement metrics beyond the core 5. Candidates: (a) Question Frequency — detect question intonation patterns in tutor speech and track questions-per-minute, (b) Response Latency — measure average time between end of tutor speech and start of student speech.

4. **Single-File Pre-Recorded Video Processing**: Accept a single video file containing both participants (e.g., a gallery-view call recording). Use face detection to identify and track two faces across frames, run MediaPipe Face Mesh on each, and use speaker diarization to separate audio. This is a harder problem than the two-file approach and has lower accuracy for both video (face isolation in variable layouts) and audio (diarization ±10% vs ±5%).

### Out of Scope

- **Video call infrastructure** — Sonder analyzes sessions, it does not host or replace video calls. Tutors and students still use their existing video call platform (Meet, Zoom, Teams) alongside Sonder.
- **Mobile or responsive design** — desktop Chrome/Firefox only. No tablet or phone support.
- **Video recording or storage** — Sonder stores metric data and summaries, not raw video or audio. Pre-recorded file input is processed but not persisted by the system.
- **Internationalization (i18n) / localization** — English only. No translation infrastructure.
- **Rate limiting, CSRF protection, or production security hardening** — this is a demo/evaluation build, not production.
- **Tutor-to-tutor comparison, leaderboards, or admin views** — single-tutor analytics only.
- **Custom ML model training or fine-tuning** — use pre-trained MediaPipe models and off-the-shelf audio analysis only. No training pipelines.
- **Chrome extension or platform-specific integrations** — the app is standalone. No embedding into video call platforms.
- **Notification channels beyond in-app toasts** — no email, SMS, push, or sound notifications.
- **Accessibility (WCAG compliance)** — not targeted for the 3-day sprint. Semantic HTML where practical but no formal accessibility audit or screen reader optimization.
- **Student analytics or student-facing dashboard** — students see only a minimal "session active" screen. No metrics, history, or insights are shown to students.
- **Student account management or persistence** — students join anonymously. No student login, profile, or session history.
- **Speaker diarization** — not needed for live sessions (separate audio channels) or the core two-file pre-recorded mode. Only used if the single-file stretch goal (Stretch #4) is implemented.

## System Overview

**React Frontend (Browser) — Tutor View**: Handles Google OAuth login. Creates sessions and displays join code/link. Captures tutor webcam via `getUserMedia`, runs MediaPipe Face Mesh, computes client-side metrics (eye contact, facial energy), and streams them plus microphone audio to the backend over WebSocket. Renders the live metrics dashboard (both participants), coaching nudge toasts, post-session analytics, trends, and settings pages.

**React Frontend (Browser) — Student View**: Minimal interface accessed via join link or code entry. Student provides a display name, grants webcam/mic access. Captures webcam via `getUserMedia`, runs MediaPipe Face Mesh, computes client-side metrics (eye contact, facial energy), and streams them plus microphone audio to the backend over WebSocket. Displays only: own webcam preview, "Session active" indicator, "Leave session" button. No metrics, nudges, or dashboard.

**FastAPI Backend (Server)**: Manages session lifecycle (create, join, end). Maintains two WebSocket connections per active session (tutor + student). Receives labeled audio chunks and client-side metrics from both participants. Runs WebRTC VAD on each audio channel independently for talk time and overlap detection. Computes prosody features for energy scoring. Runs the coaching nudge rule engine against combined metrics from both participants. Persists sessions, metric snapshots, nudges, and summaries to PostgreSQL. Serves REST API for session management, analytics, and tutor preferences. Generates post-session summaries with recommendations.

**PostgreSQL Database**: Stores tutor profiles (preferences, nudge thresholds), session records (with join codes), time-series metric snapshots (JSONB, with both participants' metrics per snapshot), nudge delivery logs, and session summaries.

**WebSocket Protocol**: Two connections per session, both to `WS /ws/session/{session_id}`. Each connection is labeled by role ("tutor" or "student") on connect. Upstream from both clients: audio chunks + client-side metrics. Downstream to tutor only: combined server metrics (both participants' talk time, interruptions, energy) + nudge triggers + attention drift flags. Downstream to student: heartbeat/keepalive only.

## Data Model

**Tutor**: Has a Google ID (unique), display name, email, avatar URL, and a JSONB `preferences` column storing nudge thresholds and enabled/disabled nudge types. Created on first Google OAuth login. A Tutor has many Sessions.

**Session**: Belongs to a Tutor. Has a UUID primary key, a 6-character alphanumeric `join_code` (unique, indexed), status (enum: "waiting", "active", "completed"), start_time, join_time (nullable — set when student joins), end_time (nullable — set when session ends), session_type (enum: "live", "pre_recorded"), student_display_name (string, nullable — set on student join), and optional context fields: subject (string, nullable), session_type_label (string, nullable — e.g., "Socratic discussion"). A Session has many MetricSnapshots, many Nudges, and one SessionSummary.

**MetricSnapshot**: Belongs to a Session. Captured at 1–2 Hz during an active session. Has a timestamp (relative to session start, in milliseconds), and a JSONB `metrics` column containing: `tutor_eye_contact` (float), `student_eye_contact` (float, nullable), `tutor_talk_pct` (float), `student_talk_pct` (float), `interruption_count` (int, cumulative), `tutor_energy` (float), `student_energy` (float, nullable), `tutor_attention_drift` (boolean), `student_attention_drift` (boolean, nullable), `drift_reason` (string, nullable). Nullable fields are null when that participant's data is unavailable (e.g., webcam denied, disconnected). Indexed on (session_id, timestamp).

**Nudge**: Belongs to a Session. Records each nudge delivered during a session. Has a timestamp, nudge_type (enum: "student_silent", "student_low_eye_contact", "tutor_dominant", "student_energy_drop", "interruption_spike", "tutor_low_eye_contact"), message text, priority (enum: "low", "medium", "high"), and the trigger metric values (JSONB).

**SessionSummary**: Belongs to a Session (one-to-one). Generated when a session ends. Has JSONB fields: `tutor_metrics` (avg/min/max per tutor metric), `student_metrics` (avg/min/max per student metric), `talk_time_ratio` (object with tutor/student percentages), `total_interruptions` (int, with per-speaker attribution), `flagged_moments` (array of {timestamp, participant, type, description}), `recommendations` (array of strings, 2–4 items), `overall_engagement_score` (float 0–100).

## API / Interface Contracts

### REST Endpoints

**Auth**
- `POST /auth/google` — Body: `{token: string}` (Google OAuth ID token). Returns: `{access_token: string, tutor: {id, name, email}}`. Creates Tutor on first login.
- `GET /auth/me` — Returns current tutor profile. Requires JWT.

**Tutor**
- `GET /tutor/preferences` — Returns nudge thresholds and enabled types. Requires JWT.
- `PUT /tutor/preferences` — Body: `{nudge_thresholds: {...}, enabled_nudges: string[]}`. Returns updated preferences. Requires JWT.

**Sessions**
- `POST /sessions` — Body: `{subject?: string, session_type_label?: string}`. Creates a session with status "waiting", generates join_code. Returns: `{session_id: uuid, join_code: string, join_url: string, start_time: iso8601}`. Requires JWT.
- `GET /sessions/{id}` — Returns session details. Requires JWT (tutor must own session).
- `POST /sessions/join` — Body: `{join_code: string, display_name: string}`. No auth required. Returns: `{session_id: uuid, participant_token: string}` (participant_token is a short-lived token authorizing the student's WebSocket connection). Returns 404 if code invalid, 409 if session already has a student, 410 if session is completed.
- `PATCH /sessions/{id}/end` — Sets end_time, status to "completed", triggers summary generation. Returns: `{session_id, end_time}`. Requires JWT.
- `GET /sessions` — Returns paginated list of tutor's sessions (most recent first). Query params: `limit` (default 20), `offset` (default 0). Requires JWT.
- `GET /sessions/{id}/summary` — Returns SessionSummary. Requires JWT.
- `GET /sessions/{id}/metrics` — Returns MetricSnapshot array. Query params: `from_ts`, `to_ts` (optional). Requires JWT.
- `GET /sessions/{id}/nudges` — Returns Nudge array. Requires JWT.

**Trends**
- `GET /tutor/trends` — Returns metric averages per session for the last N sessions, including both tutor and student metrics. Query param: `limit` (default 10). Requires JWT.

### WebSocket

- `WS /ws/session/{session_id}` — Query params: `token` (JWT for tutor, participant_token for student), `role` ("tutor" or "student").
  - **Client → Server messages (both roles)**: `{type: "audio_chunk", data: base64_pcm, timestamp: int}`, `{type: "client_metrics", data: {eye_contact_score: float, facial_energy: float}, timestamp: int}`
  - **Server → Tutor messages**: `{type: "server_metrics", data: {tutor_talk_pct, student_talk_pct, interruption_count, tutor_voice_energy, student_voice_energy}, timestamp: int}`, `{type: "nudge", data: {nudge_type, message, priority}, timestamp: int}`, `{type: "attention_drift", data: {participant: "tutor"|"student", flag: bool, reason: string}, timestamp: int}`, `{type: "student_status", data: {connected: bool}}`
  - **Server → Student messages**: `{type: "heartbeat"}` (every 10 seconds), `{type: "session_ended"}`

### Error Responses

All endpoints return errors as: `{detail: string, code: string}`. Standard codes: `UNAUTHORIZED` (401), `NOT_FOUND` (404), `CONFLICT` (409), `GONE` (410), `VALIDATION_ERROR` (422), `INTERNAL_ERROR` (500).

## Quality Requirements

- **Test coverage target**: ≥60% overall; ≥80% for the metrics engine (server-side metric calculations) and nudge rule engine. Minimum 15 tests total.
- **Performance**: Video analysis pipeline latency <500ms end-to-end (frame capture → metric update on tutor dashboard). Metric dashboard updates at ≥1 Hz. WebSocket message round-trip (audio chunk → server metric response) <1 second. Post-session summary generation <10 seconds for a 60-minute session.
- **Security**: Google OAuth required for all tutor endpoints. Student join uses a short-lived participant token scoped to a single session. JWT validation on every API call and WebSocket connection. No secrets in code — all credentials via environment variables. Input validation on all API endpoints (Pydantic models). Student display name sanitized (stripped of HTML/script tags, 1–50 characters).
- **Reliability**: Graceful degradation when either participant's face detection or audio fails (explicit UI indicators on tutor dashboard, affected metrics excluded from nudge calculations). Session data persisted even if tutor closes browser tab unexpectedly (beforeunload handler sends end-session request). Student reconnection within 30 seconds resumes metric streaming without creating a new session.
- **Setup**: One-command startup via `docker-compose up`. App accessible within 120 seconds of first run. README includes prerequisites, setup, Google OAuth configuration, and usage instructions for both tutor and student flows.

## Known Constraints

- **3-day development timeline.** Scope is aggressive. Core MVP must be fully functional; stretch goals are bonus. Prioritize rubric-weighted areas: real-time performance (25%) and metric accuracy (25%) first, then coaching value (20%), then implementation quality (15%) and documentation (15%).
- **Development is agentic** (Claude Code with TDD workflow). All requirements must be testable. The agent operates via the CLAUDE.md bootstrap protocol.
- **Browser-only client-side ML.** MediaPipe Face Mesh JS runs in Chrome/Firefox on desktop for both participants. No mobile browser support. Performance depends on client hardware — minimum target is a 2020-era laptop with integrated GPU.
- **Two-participant architecture requires both parties to connect.** The system requires the student to open Sonder in a browser alongside their video call. If the student does not join, the session still works for tutor-side metrics only, but student metrics will be unavailable. The tutor dashboard must handle this gracefully.
- **Pre-recorded mode requires two separate files.** The core pre-recorded path takes two video files (one per participant), not a single combined recording. This uses the same pipeline as live sessions and maintains the same accuracy. Single-file processing (with face isolation and diarization) is a stretch goal with lower accuracy.
- **No raw video/audio storage.** Only metric time-series data and summaries are persisted. This simplifies privacy concerns but means post-session review is metrics-only (unless stretch goal 2 is implemented for pre-recorded files).
- **Google OAuth requires a Google Cloud project with OAuth consent screen configured.** The README must document how to set up OAuth credentials. For evaluation, provide a `.env.example` with placeholder values.
- **1:1 sessions only for MVP.** The system supports exactly one tutor and one student per session. Multi-participant group sessions are a stretch goal.
- **Aligns with Nerdy's tech values**: "Live + AI" philosophy (real-time human session enhanced by AI analysis), speed-first culture (3-day sprint), AI-native tooling (built with Claude Code), and AWS-compatible architecture (Docker Compose maps cleanly to ECS/Fargate deployment).

## Reference

- [MediaPipe Face Mesh JS](https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js) — client-side face landmark detection
- [WebRTC VAD (py-webrtcvad)](https://github.com/wiseman/py-webrtcvad) — voice activity detection
- [librosa](https://librosa.org/) — audio feature extraction for prosody analysis
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) — real-time bidirectional communication
- [react-oauth/google](https://github.com/MohamadKh75/react-oauth) — Google OAuth for React
- [Recharts](https://recharts.org/) — React charting library
- Nerdy engineering challenge PDF: "AI-Powered Live Session Analysis" — evaluation rubric and success criteria
- Nerdy company profile: `company-nerdy.md` — tech stack preferences, values, and constraints
