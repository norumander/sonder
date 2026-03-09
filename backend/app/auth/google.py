"""Google OAuth token verification."""

import logging

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

logger = logging.getLogger(__name__)


def verify_google_token(token: str) -> dict | None:
    """Verify a Google OAuth ID token and return user info.

    Returns dict with keys: sub, name, email, picture (all strings).
    Returns None if verification fails.
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
        return {
            "sub": idinfo["sub"],
            "name": idinfo.get("name", ""),
            "email": idinfo.get("email", ""),
            "picture": idinfo.get("picture"),
        }
    except ValueError:
        logger.warning("Google token verification failed")
        return None
