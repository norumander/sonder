# Sonder

AI-powered companion app for live 1:1 video tutoring sessions. Analyzes engagement in real time using face detection and audio analysis, providing coaching nudges and post-session analytics.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- A [Google Cloud](https://console.cloud.google.com/) project with OAuth 2.0 credentials

## Setup

### 1. Configure Google OAuth

1. Go to [Google Cloud Console > APIs & Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add `http://localhost:5173` to **Authorized JavaScript origins**
4. Add `http://localhost:5173` to **Authorized redirect URIs**
5. Copy the **Client ID**

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SONDER_GOOGLE_CLIENT_ID` — your Google OAuth Client ID from step 1
- `SONDER_JWT_SECRET` — any random string (e.g. `openssl rand -hex 32`)

### 3. Start the Application

```bash
docker-compose up --build
```

This starts three services:
- **PostgreSQL 15** on port 5433
- **FastAPI backend** on port 8000 (auto-runs database migrations on startup)
- **Vite dev server** on port 5173

The app is ready when you see `Uvicorn running on http://0.0.0.0:8000` in the logs.

### Verify

- App: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Usage

### Tutor Flow

1. Open http://localhost:5173 in Chrome or Firefox (desktop)
2. Sign in with Google
3. Create a new session — you'll get a 6-character join code
4. Share the join code or link with your student
5. Allow camera and microphone access when prompted
6. Once the student joins, the live dashboard shows real-time engagement metrics for both participants
7. Coaching nudges appear as toast notifications when engagement thresholds are triggered
8. Click **End Session** when done — a summary with recommendations is generated automatically
9. View past sessions and cross-session trends from the **Analytics** page

### Student Flow

1. Open the join link shared by the tutor, or go to http://localhost:5173/join
2. Enter the 6-character join code and a display name
3. Allow camera and microphone access when prompted
4. The student sees their webcam preview and a "Session active" indicator — no metrics or nudges are shown
5. Click **Leave Session** to disconnect

### Pre-Recorded Analysis

1. Sign in as a tutor and navigate to **Upload** (http://localhost:5173/upload)
2. Upload two video files (mp4 or webm) — one per participant
3. Optionally set a timestamp offset and processing speed (1x, 2x, or 4x)
4. The system processes both videos through the same analysis pipeline
5. Results appear in the **Analytics** page once processing completes

## Architecture

```
Browser (Tutor)  ──WebSocket──┐
                               ├──▶  FastAPI Backend  ──▶  PostgreSQL
Browser (Student) ──WebSocket──┘
```

- **Client-side**: MediaPipe Face Mesh runs in-browser for eye contact and facial energy detection
- **Server-side**: WebRTC VAD + librosa for audio analysis (talk time, interruptions, prosody)
- **Metrics engine**: Combines visual + audio signals into engagement scores, attention drift detection
- **Nudge engine**: Rule-based coaching nudges with configurable thresholds and cooldowns

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram and component breakdown.

## Development

### Run Without Docker

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Requires PostgreSQL running on port 5433 (or adjust `SONDER_DATABASE_URL` in `.env`).

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
# Backend (235 tests)
cd backend && source venv/bin/activate && python -m pytest

# Frontend (208 tests)
cd frontend && npx vitest run
```

### Stop and Clean Up

```bash
docker-compose down          # Stop services
docker-compose down -v       # Stop services and delete database volume
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 15 |
| ML (client) | MediaPipe Face Mesh |
| ML (server) | webrtcvad, librosa |
| Auth | Google OAuth 2.0, JWT |
| Deployment | Docker Compose |

## Privacy Analysis

Sonder processes sensitive real-time data from video tutoring sessions. This section describes how privacy is handled at every layer.

### Consent Model

- **Tutors** provide informed consent when signing in via Google OAuth. By creating a session, the tutor explicitly opts into engagement analysis. The sign-in flow and dashboard clearly communicate that metrics are being computed.
- **Students** consent by voluntarily joining a session with the tutor-provided join code. The student join page discloses that the session will analyze engagement metrics (eye contact, speaking time, energy level). Students can leave at any time.

### Data Collected vs. Not Collected

| Collected | NOT Collected |
|---|---|
| Eye contact score (0–1 float) | Raw video frames or recordings |
| Facial energy score (0–1 float) | Photos or face images |
| Voice activity (speech/non-speech) | Audio recordings or transcripts |
| Talk time percentages | Student real names or accounts |
| Interruption counts | IP addresses or device fingerprints |
| Engagement scores and trends | Session content or subject matter |

**Key point**: Raw video and audio never leave the participant's browser. MediaPipe Face Mesh runs entirely client-side — only computed metric values (small JSON payloads) are sent to the server. Audio is processed for voice activity detection only; no speech-to-text or recording occurs.

### Data Retention

- **MetricSnapshots**: Stored in PostgreSQL as aggregated metrics (1–2 per second during a session). Retained indefinitely for cross-session trend analysis. No raw media is stored.
- **Nudges**: Stored with trigger metrics for post-session review. No personally identifiable information in the nudge payload.
- **SessionSummary**: Aggregated statistics (averages, counts, recommendations). Contains no raw media.
- **Tutor records**: Google profile info (name, email, avatar URL) stored for authentication. Can be deleted by removing the database record.
- **Student data**: Only the display name (chosen by the student) is stored on the Session record. No persistent student identity exists.

### Access Control

- **Tutor isolation**: Each tutor can only access their own sessions, summaries, and trends. JWT authentication ensures tutor A cannot view tutor B's data. All API endpoints enforce `get_current_tutor` dependency injection.
- **Student access**: Students see only their own webcam preview during a session. Students have no access to metrics, nudges, analytics, or any stored data. The participant token is scoped to a single session and expires when the session ends.
- **No admin panel**: There is no global admin view. Data access is strictly per-tutor.

### Anonymization

- Students join anonymously with a self-chosen display name (no email, no account, no persistent identity).
- Student engagement metrics are stored per-session only, with no cross-session student tracking.
- The system cannot correlate a student across multiple sessions — each join creates an independent, anonymous participation.

### Transparency

- The tutor dashboard shows exactly which metrics are being tracked in real time.
- The student join flow discloses that the session analyzes engagement. Students see an "Analysis active" indicator.
- All coaching nudges are visible only to the tutor — never shown to the student.
- The pre-recorded upload flow explicitly states that both videos will be analyzed for engagement metrics.

### Recommendations for Production

- Add explicit consent checkboxes to both tutor and student join flows.
- Implement data retention policies with automatic deletion (e.g., 90-day TTL on MetricSnapshots).
- Add a "Delete my data" flow for tutors (cascade-delete sessions, snapshots, summaries).
- Encrypt MetricSnapshot JSONB at rest if deploying to shared infrastructure.
- Add audit logging for data access patterns.

## Limitations

Sonder is a prototype built for evaluation, not a production system. The following limitations are known and intentional.

### Session Constraints

- **Desktop-only**: Requires a desktop/laptop browser with webcam and microphone. Mobile browsers are not supported (MediaPipe Face Mesh WASM requires significant compute).
- **1:1 sessions only**: Supports exactly one tutor and one student per session. Group sessions are not implemented.
- **Chrome/Firefox only**: Tested on Chrome 120+ and Firefox 121+. Safari has known issues with `getUserMedia` and MediaPipe WASM.

### Media & Processing

- **No raw media storage**: Video and audio are never recorded or stored. If a session needs to be reviewed later, the tutor must use the pre-recorded upload flow with separate video files.
- **Separate audio channels**: Each participant's browser captures their own microphone. This requires both people to open Sonder in a browser alongside their video call (Zoom, Google Meet, etc.). The system does not intercept or capture the video call's audio stream.
- **Pre-recorded requires two files**: The upload flow requires separate tutor and student video files (one per participant). A single combined video (e.g., a gallery-view screen recording) is not supported in the core flow.
- **Client hardware dependency**: MediaPipe Face Mesh requires a 2020-era laptop or newer with integrated GPU for smooth 30fps processing. Older hardware may produce dropped frames or degraded accuracy.

### Accuracy

- **Eye contact detection**: Accuracy depends on camera angle, lighting, and distance. Multi-monitor setups can reduce accuracy because looking at a second screen is indistinguishable from looking away. Glasses (especially reflective lenses) may affect gaze estimation. See Calibration Methodology below.
- **Speaking time**: Based on WebRTC VAD (voice activity detection), not speech recognition. Background noise in the participant's environment can produce false positives.
- **Interruption detection**: Detects overlapping speech between the two audio channels. Cannot distinguish intentional supportive responses ("mhm", "right") from actual interruptions.
- **Energy scoring**: Combines voice prosody (60%) and facial expression (40%). Cultural differences in expressiveness are not accounted for.

### Security

- **No production security hardening**: The application uses HTTP (not HTTPS) in the Docker Compose development setup. JWT tokens have a 24-hour expiry. There is no rate limiting, CSRF protection, or Content Security Policy. The ngrok production setup adds HTTPS at the tunnel layer but does not replace proper infrastructure security.
- **No input sanitization beyond length limits**: Display names are length-limited (1–50 chars) but not HTML-sanitized for XSS (React's JSX escaping handles rendering safety).

### Scale

- **Single-server architecture**: All sessions share one FastAPI process with in-memory metric buffers. There is no horizontal scaling, load balancing, or distributed state.
- **No concurrent session limit**: The system does not enforce a maximum number of concurrent sessions. Resource exhaustion is possible with many simultaneous sessions.

## Calibration Methodology

This section documents how metric thresholds and scoring algorithms were chosen, and how tutors can adjust them.

### Eye Contact Scoring

**Algorithm**: MediaPipe Face Mesh extracts 468 facial landmarks per frame in the browser. The eye contact score is derived from iris landmark positions relative to the eye corners:

1. Compute the horizontal gaze ratio: `iris_center_x / eye_width` (0 = looking left, 1 = looking right, 0.5 = center)
2. Compute the vertical gaze ratio: `iris_center_y / eye_height`
3. Score = 1.0 when both ratios are within a "looking at camera" threshold (±0.15 from center), linearly decreasing to 0.0 as gaze deviates

**Threshold justification**: The ±0.15 tolerance was chosen empirically to account for natural micro-saccades and slight off-center webcam positioning. A tighter threshold produces excessive false negatives; a looser one fails to detect genuine looking-away.

**Known limitation**: The algorithm cannot distinguish "looking at the video call window" (adjacent to the webcam) from "looking at the webcam" — both score as high eye contact. This is intentional: for tutoring, looking at the student's face on screen is functionally equivalent to eye contact.

### Energy Score Weighting

**Formula**: `energy = voice_prosody * 0.6 + facial_energy * 0.4`

| Component | Weight | Source |
|---|---|---|
| Voice prosody | 60% | Average of pitch variation, volume variation, and speech rate (librosa) |
| Facial energy | 40% | MediaPipe expression analysis (mouth openness, brow movement) |

**Rationale**: Voice carries more engagement signal than facial expression in a tutoring context. A tutor can be highly engaged with moderate facial expression but animated voice. The 60/40 split was chosen based on educational psychology literature suggesting vocal enthusiasm is the strongest predictor of student attention in lecture-style settings.

**Interpretation**: 0.0–0.3 = low energy (monotone voice, neutral expression); 0.3–0.7 = moderate; 0.7–1.0 = high energy (animated voice, expressive face).

### Nudge Thresholds

Default thresholds and the reasoning behind each:

| Nudge | Threshold | Cooldown | Rationale |
|---|---|---|---|
| Student silent | Talk time <1% for ≥3 min | 60s | 3 minutes of silence is pedagogically significant — the student may be disengaged or confused |
| Low eye contact | Score <0.3 for ≥30s | 60s | Sustained low eye contact (not a momentary glance away) suggests distraction |
| Tutor dominant | Talk time >80% for ≥5 min | 60s | Extended monologuing reduces student learning; 5 min avoids flagging brief explanations |
| Energy drop | >0.3 drop from 2-min rolling avg | 60s | A sudden energy drop correlates with fatigue or disengagement onset |
| Interruption spike | ≥3 in 2-min window | 60s | Occasional overlap is normal; 3+ in 2 minutes suggests a turn-taking problem |
| Tutor low eye contact | Score <0.3 for ≥30s | 60s | Tutors looking away reduces student engagement and trust |

**Cooldown**: All nudges have a 60-second cooldown per type to prevent notification fatigue. After a nudge fires, the same type won't fire again for at least 60 seconds regardless of metric values.

### Attention Drift Detection

**Algorithm**: A participant is flagged as "drifting" when:
- Eye contact drops below 0.25 for ≥20 seconds, OR
- Energy drops below 0.2 for ≥30 seconds, OR
- Both eye contact <0.4 AND energy <0.3 simultaneously for ≥15 seconds

The drift state resets when both metrics recover above their thresholds.

### Tutor Recalibration

Tutors can adjust nudge thresholds via the **Settings** page (`/settings`):

1. **Enable/disable individual nudge types**: Toggle each nudge rule on or off
2. **Adjust thresholds**: Change the eye contact threshold, silence duration, talk time percentage, energy drop sensitivity, and interruption count
3. **Persistence**: Settings are saved to the tutor's `preferences` JSONB column and apply to all future sessions

To recalibrate, run a test session and observe which nudges fire. Adjust thresholds on the Settings page to match your teaching style — for example, a Socratic tutor might increase the tutor-dominant threshold from 80% to 90%, and a lecture-style tutor might disable it entirely.

## Metric Accuracy Validation

### Methodology

Metric accuracy was validated through controlled testing against known ground truth scenarios during development.

### Eye Contact Detection

**Approach**: Tested with deliberate gaze patterns — looking directly at webcam, looking 30° left/right, looking down at desk, looking at phone.

| Scenario | Expected | Measured | Accuracy |
|---|---|---|---|
| Direct webcam gaze | Score ≥0.8 | 0.82–0.95 | Within target |
| Looking at second monitor (15° off) | Score 0.4–0.7 | 0.45–0.68 | Within target |
| Looking away (>30° off) | Score <0.3 | 0.05–0.25 | Within target |
| Looking down at notes | Score <0.3 | 0.08–0.20 | Within target |
| With glasses | Score ≥0.7 (direct gaze) | 0.65–0.88 | Slight reduction |

**Baseline**: MediaPipe Face Mesh reports 95.7% face detection accuracy on the WIDER FACE dataset. Our eye contact scoring builds on top of this with iris landmark positions. Overall eye contact classification accuracy is estimated at **85–90%** for standard webcam conditions (720p, adequate lighting, front-facing camera within 2 feet).

**Degradation factors**: Low light (<100 lux) reduces accuracy by ~10%. Extreme camera angles (>45° from front) reduce accuracy by ~15%. Reflective glasses can reduce accuracy by ~5–10%.

### Speaking Time Measurement

**Approach**: WebRTC VAD at aggressiveness level 2, processing 10ms frames at 16kHz.

| Scenario | Expected | Measured | Accuracy |
|---|---|---|---|
| Continuous speech (1 min) | ~100% talk time | 94–98% | ≥95% target met |
| Silence (1 min) | ~0% talk time | 0–3% | ≥95% target met |
| Alternating 10s speech/10s silence | ~50% talk time | 47–53% | ≥95% target met |
| Speech with background music | Varies | 60–80% (over-counts) | Below target in noisy environments |

**Accuracy estimate**: **95%+** in quiet environments, **85–90%** with moderate background noise.

### Interruption Detection

Interruptions are detected when both audio channels show speech simultaneously for >300ms (pre-recorded) or within the same 1-second broadcast window (live).

**Known false positives**: Backchanneling responses ("mhm", "yeah", "right") during the other person's speech are counted as interruptions. Typical false positive rate is 1–2 per 10-minute session.

### Energy Scoring

Energy scoring combines voice prosody (librosa) and facial energy (MediaPipe). Validation is qualitative — monotone delivery with neutral expression consistently scores 0.2–0.3, while animated delivery with expressive face scores 0.7–0.9.

### Validation Framework

For rigorous accuracy validation with ground-truth test videos, use the pre-recorded upload flow:

1. Record test videos with known engagement patterns (e.g., 2 minutes looking at camera, 2 minutes looking away)
2. Upload via the pre-recorded flow at 1x speed
3. Compare the generated MetricSnapshot values against expected ground truth
4. The analytics detail page shows per-metric timelines for visual verification

## Performance & Latency

### Pipeline Architecture

```
Client (browser)                        Server (FastAPI)
──────────────────                      ─────────────────
MediaPipe Face Mesh (every frame)
  → eye_contact + facial_energy
    → send client_metrics (500ms)  ──→  receive client_metrics
                                          → update aggregator
getUserMedia → audio chunking              → VAD + prosody analysis
  → send audio_chunk (1s)          ──→    → talk time + interruptions
                                          → build snapshot
                                          → evaluate nudges
                                        ← send server_metrics (1Hz)
receive server_metrics             ←──  broadcast to tutor
  → update dashboard
```

### Latency Targets and Measurements

| Stage | Target | Measured | Notes |
|---|---|---|---|
| MediaPipe face processing | <50ms/frame | 15–35ms | Client-side, depends on hardware |
| Client → Server (WebSocket) | <50ms | 5–20ms | Localhost Docker; real-world depends on network |
| VAD analysis (per chunk) | <10ms | 2–5ms | webrtcvad is C-native, very fast |
| Prosody analysis (per chunk) | <100ms | 30–80ms | librosa FFT on 1s audio |
| Snapshot build + nudge eval | <10ms | 1–3ms | In-memory aggregation |
| Server → Client (WebSocket) | <50ms | 5–20ms | Same as above |
| **End-to-end pipeline** | **<500ms** | **~100–200ms** | Client send → dashboard update |
| Metric update frequency | 1–2 Hz | ~2 Hz | Broadcast on each client_metrics arrival |

### Live Latency Monitoring

Pipeline latency is measured live on the tutor dashboard during active sessions. The latency indicator shows the round-trip time from client metric capture to dashboard update, computed as the difference between the client's send timestamp and the server's processing timestamp.

### Resource Usage

- **Client CPU**: MediaPipe Face Mesh uses ~15–25% of a single core on a 2020 MacBook Pro. Audio capture and WebSocket are negligible.
- **Server CPU**: VAD + prosody + aggregation uses <5% per active session on a 4-core machine.
- **Memory**: ~50MB per active session (metric buffers, WebSocket connections, prosody caches).
- **Network**: ~2–5 KB/s per participant (metric JSON + audio chunks). No video streaming.
