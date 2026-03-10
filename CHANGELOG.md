# CHANGELOG.md — Bug Fix Log

Read this file before fixing any bug. See CLAUDE.md "Bug Fix Changelog" section for rules.

---

## 2026-03-09: Metrics never populated on tutor dashboard

- **Symptom**: Tutor dashboard showed "Waiting for metrics..." indefinitely.
- **Root cause**: `useMetricsStreaming` effect depended on `ws` ref (never changes identity) instead of `isStreaming` state. The effect never re-ran when the WebSocket opened.
- **Fix**: Changed `useMetricsStreaming` effect dependency from `[ws]` to `[isStreaming]` (where `isStreaming = useWebSocketReady(ws)`).
- **Files**: `frontend/src/shared/useMetricsStreaming.ts`

## 2026-03-09: Session end not reaching student

- **Symptom**: When the tutor clicked "End Session," the student didn't see the session ended screen.
- **Root cause**: `endSession()` immediately set `sessionEnded=true` locally, which unmounted the component and closed the WebSocket before the backend could broadcast `session_ended` to the student.
- **Fix**: Added a 500ms deferred state update so the WebSocket stays open long enough for the backend to broadcast.
- **Files**: `frontend/src/sessions/useSessionLifecycle.ts` (later replaced by `useTutorSessionControl.ts`)

## 2026-03-09: Analytics white screen on empty metrics

- **Symptom**: Analytics detail page crashed (white screen) for sessions with no metric data.
- **Root cause**: `MetricSummarySection` accessed `metrics.eye_contact.avg` without null checks. Sessions with empty metrics (`{}`) caused a TypeError.
- **Fix**: Added null checks and a "No metric data" fallback UI.
- **Files**: `frontend/src/analytics/AnalyticsPage.tsx`

## 2026-03-09: Pydantic Settings crash with extra env vars

- **Symptom**: Backend failed to start with `ValidationError` when `.env` contained Docker/frontend variables.
- **Root cause**: Pydantic `BaseSettings` rejected unrecognized env vars by default.
- **Fix**: Added `extra="ignore"` to the Settings model config.
- **Files**: `backend/app/config.py`

## 2026-03-10: Backend Docker build failure (dependency versions)

- **Symptom**: `pip install` failed during Docker build — `mediapipe==0.10.32` doesn't exist, `numpy==2.4.3` incompatible.
- **Root cause**: Unpinned or over-pinned dependency versions.
- **Fix**: Pinned to `mediapipe==0.10.18`, `numpy==1.26.4`, `opencv-python-headless==4.10.0.84`.
- **Files**: `backend/requirements.txt`

## 2026-03-10: Alembic module import error in Docker

- **Symptom**: `alembic upgrade head` failed in Docker with `ModuleNotFoundError: No module named 'app'`.
- **Root cause**: `PYTHONPATH` wasn't set in the Docker entrypoint before running alembic.
- **Fix**: Added `export PYTHONPATH=/app` to `entrypoint.sh` before the alembic command.
- **Files**: `backend/entrypoint.sh`

## 2026-03-10: WebSocket connections failing in Docker + React StrictMode

- **Symptom**: WebSocket connected but metrics never flowed. Second symptom: session_ended not reaching student.
- **Root cause**: Two issues combined:
  1. **Docker proxy**: WebSocket URLs used `window.location.host` (port 5173), relying on Vite's `/ws` proxy. Inside Docker, the proxy target `ws://localhost:8000` was unreachable from the frontend container.
  2. **React StrictMode double-mount**: `useState(() => new WebSocket(...))` initializer ran twice — first WS took the backend slot, second (used by component) was rejected with 403.
- **Fix**:
  1. Build WebSocket URLs from `API_BASE` (resolves to `localhost:8000` directly from browser via Docker port mapping).
  2. Create WebSocket in `useEffect` with cleanup. Backend handler replaces stale connections instead of rejecting.
- **Files**: `frontend/src/App.tsx`, `backend/app/websocket/handler.py`

## 2026-03-10: Student leave ends session for tutor

- **Symptom**: When student clicked "Leave Session," the tutor's session also ended.
- **Root cause**: Student's "Leave Session" button called `endSession()` which sent `end_session` WS message and PATCH request — same as tutor ending the session.
- **Fix**: Student's leave button now calls `onLeave` callback instead. No `end_session` message sent. Student sees a "You left" screen with a Rejoin button. Split `useSessionLifecycle` into `useSessionEnded` (shared) and `useTutorSessionControl` (tutor-only).
- **Files**: `frontend/src/student/StudentSession.tsx`, `frontend/src/sessions/useSessionEnded.ts`, `frontend/src/sessions/useTutorSessionControl.ts`, `frontend/src/student/StudentLeftScreen.tsx`

## 2026-03-10: Removed student disconnect timeout

- **Symptom**: Sessions auto-ended when the student disconnected briefly.
- **Root cause**: Backend had a reconnect timer that ended the session after a student disconnect timeout.
- **Fix**: Removed `_reconnect_timers`, `RECONNECT_TIMEOUT_S`, `_reconnect_timeout()` from backend. Sessions only end when the tutor explicitly ends them. Removed related frontend types, UI, and tests.
- **Files**: `backend/app/websocket/handler.py`, `frontend/src/shared/types.ts`, `frontend/src/sessions/SessionEndedScreen.tsx`, `backend/tests/test_session_lifecycle.py`

## 2026-03-10: Student on "left" screen misses session_ended

- **Symptom**: If the tutor ended the session while the student was on the "You left" screen, the student never saw "Session Ended" — they still saw a stale "Rejoin" button.
- **Root cause**: WebSocket was created inside `StudentSessionWithWs`, which only mounted when `active=true`. When student left (`active=false`), the WS was destroyed, severing the only channel for `session_ended`.
- **Fix**: Lifted WebSocket creation and `useSessionEnded` to `StudentFlow` level. WS stays alive as long as `session` exists (regardless of `active`). `sessionEnded` check takes render priority over active/left states. Removed `StudentSessionWithWs` wrapper.
- **Files**: `frontend/src/App.tsx`, `frontend/src/student/StudentSession.tsx`

## 2026-03-10: Render gap on student join (flash of StudentJoinPage)

- **Symptom**: Brief flash of StudentJoinPage between joining and WebSocket creation.
- **Root cause**: When `setSession` + `setActive` fire but the useEffect creating the WS hasn't run yet, `session && active && ws` is false (ws=null), falling through to the StudentJoinPage branch.
- **Fix**: Added loading guard — `session && active && !ws` now shows "Connecting…" instead of StudentJoinPage.
- **Files**: `frontend/src/App.tsx`

## 2026-03-10: Student shows "Waiting for tutor" after rejoin

- **Symptom**: After student leaves and clicks Rejoin, they see "Waiting for tutor to join the session" even though the tutor is connected.
- **Root cause**: `tutorConnected` was local state in `StudentSession` (`useState(false)`). On rejoin, `StudentSession` remounts → state resets to `false`. The WS doesn't reconnect (lives in `StudentFlow`), so the backend never re-sends `tutor_status`. State was permanently stale.
- **Fix**: Two changes:
  1. **Lifted `tutorConnected` to `StudentFlow`** — state persists across leave/rejoin since the parent doesn't unmount. Listener at flow level also handles `session_status` responses.
  2. **Added `request_status` WS message** — backend handler responds with `{"type": "session_status", "data": {"session_id", "tutor_connected", "student_connected"}}`. StudentSession sends `request_status` on mount as belt-and-suspenders sync.
- **Files**: `frontend/src/App.tsx`, `frontend/src/student/StudentSession.tsx`, `backend/app/websocket/handler.py`, `backend/tests/test_session_lifecycle.py`

## 2026-03-10: Analytics never populated (timestamp_ms int32 overflow)

- **Symptom**: Tutor dashboard showed "Waiting for metrics..." and analytics pages showed "No metric data available" for all sessions.
- **Root cause**: `MetricSnapshot.timestamp_ms` and `Nudge.timestamp_ms` columns were `Integer` (int32, max 2,147,483,647) but store Unix milliseconds (~1.77 trillion in 2026). Every `INSERT` into `metric_snapshots` and `nudges` failed with `asyncpg.exceptions.DataError: value out of int32 range`. The exception was silently caught in `_persist_snapshot` and `_persist_nudge`.
- **Fix**: Changed both columns from `Integer` to `BigInteger` (int64) in the SQLAlchemy models. Created Alembic migration `ee2890df3412` to alter the column types.
- **Additional fixes**:
  - Converted `session_id` from string to `uuid.UUID` in `_persist_snapshot`, `_persist_nudge`, and `_end_session_in_db` (asyncpg strict UUID typing).
  - Auto-navigate tutor to `/analytics/:sessionId` when session ends (was dead-end `SessionEndedScreen`).
  - Added "View Session Analytics" button to `SessionEndedScreen` as fallback.
- **Files**: `backend/app/models/models.py`, `backend/alembic/versions/ee2890df3412_change_timestamp_ms_to_bigint.py`, `backend/app/websocket/handler.py`, `frontend/src/sessions/TutorSessionPage.tsx`, `frontend/src/sessions/SessionEndedScreen.tsx`
