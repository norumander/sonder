# TESTING.md

## Test Commands

### Backend (pytest)
```bash
# Run all backend tests
cd backend && python -m pytest

# Run a specific test file
cd backend && python -m pytest tests/test_metrics.py

# Run a specific test
cd backend && python -m pytest tests/test_metrics.py::test_eye_contact_centered_face_high_score

# Run with coverage
cd backend && python -m pytest --cov=app --cov-report=term-missing

# Run with verbose output
cd backend && python -m pytest -v
```

### Frontend (Vitest)
```bash
# Run all frontend tests
cd frontend && npx vitest run

# Run in watch mode
cd frontend && npx vitest

# Run a specific test file
cd frontend && npx vitest run src/metrics/eyeContact.test.ts

# Run with coverage
cd frontend && npx vitest run --coverage
```

## Strategy

### Unit Tests (majority — fast, isolated)
- **Backend metrics engine**: Talk time calculation, interruption detection, energy scoring, attention drift logic. These are pure functions operating on numeric inputs — highly testable.
- **Backend nudge engine**: Rule evaluation against metric thresholds, cooldown enforcement, queue behavior. Test each rule independently.
- **Backend audio analysis**: VAD classification, prosody feature extraction. Use pre-computed test audio samples.
- **Backend summary generator**: Aggregation logic (avg/min/max), recommendation selection, flagged moment identification.
- **Backend auth**: JWT creation/validation, Google token verification (mocked).
- **Backend session API**: CRUD operations, join code validation, status transitions.
- **Frontend client metrics**: Eye contact score computation from landmarks, facial energy extraction. Use synthetic landmark data.
- **Frontend nudge display**: Queue behavior, auto-dismiss timing, max-one-visible rule.

### Integration Tests (targeted — system boundaries)
- **Backend WebSocket**: Connect, authenticate, send/receive messages, disconnect handling. Uses FastAPI TestClient WebSocket support.
- **Backend API + Database**: Session lifecycle (create → join → active → end → summary). Uses test database.
- **Frontend WebSocket hook**: Message serialization/deserialization, reconnection logic. Uses mock WebSocket.

### What We Don't Test
- MediaPipe Face Mesh accuracy (third-party library)
- WebRTC VAD classification accuracy (third-party library)
- React rendering internals (framework)
- Tailwind CSS output (framework)
- Docker Compose orchestration (infrastructure — tested manually)

## Coverage Targets

| Scope | Minimum Coverage |
|---|---|
| Overall | ≥60% |
| `backend/app/metrics/` | ≥80% |
| `backend/app/nudges/` | ≥80% |
| `backend/app/audio/` | ≥70% |
| `backend/app/summary/` | ≥70% |
| `backend/app/auth/` | ≥70% |
| `frontend/src/metrics/` | ≥80% |
| Minimum total test count | ≥15 |

## Conventions

### File Structure
- Backend tests live in `backend/tests/` mirroring the `app/` structure
- Frontend tests live alongside source files: `foo.ts` → `foo.test.ts`
- Shared test fixtures in `backend/tests/conftest.py` and `frontend/src/test/setup.ts`

### Naming
```
# Backend (pytest)
test_<action>_<condition>_<expected>
# Examples:
test_compute_talk_time_tutor_speaks_60pct_returns_60
test_detect_interruption_overlap_300ms_counts_one
test_nudge_student_silent_3min_fires_check_understanding

# Frontend (Vitest)
describe('<ComponentOrFunction>', () => {
  it('<action> when <condition>', () => { ... })
})
// Examples:
describe('computeEyeContact', () => {
  it('returns high score when iris is centered', () => { ... })
})
```

### Fixtures & Test Data
- Use factory functions to create test data (e.g., `create_test_session()`, `create_metric_stream()`)
- Pre-computed landmark arrays for face mesh tests (stored as JSON fixtures)
- Short audio samples (1–5 seconds) for VAD/prosody tests (stored as binary fixtures in `backend/tests/fixtures/`)
- No external API calls in tests — mock Google OAuth, database uses test PostgreSQL or SQLite

### Mocking Rules
- Mock at boundaries only: network calls, database (when unit testing), clock/time, file system
- Never mock the module under test
- Use `unittest.mock.patch` (backend) and `vi.mock` (frontend)
- For WebSocket tests: use FastAPI's `TestClient` WebSocket support (backend), mock `WebSocket` class (frontend)
- For database tests: use a real test database with transaction rollback per test (preferred) or SQLite in-memory

### Test Database
- Backend integration tests use a separate PostgreSQL database (test container or local)
- Each test runs in a transaction that is rolled back after the test
- `conftest.py` provides `async_session` and `test_client` fixtures
