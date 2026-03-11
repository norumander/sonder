"""Google OAuth token verification."""

import logging
import json
import urllib.request
import urllib.error

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

logger = logging.getLogger(__name__)


def verify_google_token(token: str) -> dict | None:
    """Verify a Google OAuth token (ID token or access token) and return user info.

    Returns dict with keys: sub, name, email, picture (all strings).
    Returns None if verification fails.
    """
    if token.startswith("ya29."):
        # Handle OAuth2 Access Token via Implicit Flow
        req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token}"}
        )
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                return {
                    "sub": data["sub"],
                    "name": data.get("name", ""),
                    "email": data.get("email", ""),
                    "picture": data.get("picture"),
                }
        except Exception as e:
            logger.warning("Google access token verification failed: %s", e)
            return None

    # Handle standard JWT ID Token
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
        logger.warning("Google ID token verification failed")
        return None
