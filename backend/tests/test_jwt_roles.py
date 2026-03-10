"""Tests for JWT role-based token semantics — Chunk 1 remediation."""

import uuid

from app.auth.jwt import (
    create_access_token,
    create_student_token,
    decode_access_token,
)


class TestTutorToken:
    """Tutor tokens include role=tutor in the JWT payload."""

    def test_tutor_token_has_role_claim(self):
        """Tutor JWT contains role='tutor' in payload."""
        tutor_id = str(uuid.uuid4())
        token = create_access_token(tutor_id=tutor_id)
        payload = decode_access_token(token)
        assert payload["role"] == "tutor"

    def test_tutor_token_sub_is_tutor_id(self):
        """Tutor JWT sub claim is the tutor UUID."""
        tutor_id = str(uuid.uuid4())
        token = create_access_token(tutor_id=tutor_id)
        payload = decode_access_token(token)
        assert payload["sub"] == tutor_id


class TestStudentToken:
    """Student tokens include role=student and sub=session_id."""

    def test_student_token_has_role_claim(self):
        """Student JWT contains role='student' in payload."""
        session_id = str(uuid.uuid4())
        token = create_student_token(session_id=session_id)
        payload = decode_access_token(token)
        assert payload["role"] == "student"

    def test_student_token_sub_is_session_id(self):
        """Student JWT sub claim is the session UUID."""
        session_id = str(uuid.uuid4())
        token = create_student_token(session_id=session_id)
        payload = decode_access_token(token)
        assert payload["sub"] == session_id

    def test_student_token_does_not_use_prefix(self):
        """Student JWT sub does NOT use 'student:' prefix."""
        session_id = str(uuid.uuid4())
        token = create_student_token(session_id=session_id)
        payload = decode_access_token(token)
        assert not payload["sub"].startswith("student:")


class TestWebSocketAuthenticate:
    """WebSocket _authenticate uses role claim to distinguish tutor vs student."""

    def test_authenticate_tutor_by_role_claim(self):
        """Tutor token with role=tutor returns ('tutor', tutor_id)."""
        from app.websocket.handler import _authenticate

        tutor_id = str(uuid.uuid4())
        session_id = str(uuid.uuid4())
        token = create_access_token(tutor_id=tutor_id)
        result = _authenticate(token, session_id)
        assert result == ("tutor", tutor_id)

    def test_authenticate_student_by_role_claim(self):
        """Student token with role=student returns ('student', session_id)."""
        from app.websocket.handler import _authenticate

        session_id = str(uuid.uuid4())
        token = create_student_token(session_id=session_id)
        result = _authenticate(token, session_id)
        assert result == ("student", session_id)

    def test_authenticate_student_wrong_session_returns_none(self):
        """Student token for different session returns None."""
        from app.websocket.handler import _authenticate

        session_id = str(uuid.uuid4())
        other_session = str(uuid.uuid4())
        token = create_student_token(session_id=other_session)
        result = _authenticate(token, session_id)
        assert result is None

    def test_authenticate_no_token_returns_none(self):
        """No token returns None."""
        from app.websocket.handler import _authenticate

        result = _authenticate(None, str(uuid.uuid4()))
        assert result is None

    def test_authenticate_invalid_token_returns_none(self):
        """Invalid token returns None."""
        from app.websocket.handler import _authenticate

        result = _authenticate("invalid-token", str(uuid.uuid4()))
        assert result is None
