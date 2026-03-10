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
