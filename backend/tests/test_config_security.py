"""Tests for configuration security hardening — Chunk 1 remediation."""

import subprocess
import sys


def _run_config_module(env: dict) -> subprocess.CompletedProcess:
    """Run a subprocess that imports app.config with given env vars.

    Returns the CompletedProcess with returncode and stderr.
    """
    # Build a clean environment with only the vars we need
    import os

    clean_env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        **env,
    }
    return subprocess.run(
        [sys.executable, "-c", "import app.config"],
        capture_output=True,
        text=True,
        env=clean_env,
        cwd=str(_backend_dir()),
        timeout=10,
    )


def _backend_dir():
    from pathlib import Path

    return Path(__file__).parent.parent


class TestProductionFailFast:
    """Production environment must reject default/missing critical config."""

    def test_production_rejects_missing_jwt_secret(self):
        """App exits with validation error when JWT secret is not set."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "production",
            "SONDER_GOOGLE_CLIENT_ID": "some-client-id",
        })
        assert result.returncode == 1

    def test_production_rejects_missing_google_client_id(self):
        """App exits with code 1 when Google Client ID is missing in production."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "production",
            "SONDER_JWT_SECRET": "a-secure-random-secret-value",
            "SONDER_GOOGLE_CLIENT_ID": "",
        })
        assert result.returncode == 1
        assert "SONDER_GOOGLE_CLIENT_ID" in result.stderr

    def test_production_accepts_valid_config(self):
        """App starts successfully with valid production config."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "production",
            "SONDER_JWT_SECRET": "a-secure-random-secret-value",
            "SONDER_GOOGLE_CLIENT_ID": "real-google-client-id",
        })
        assert result.returncode == 0

    def test_development_starts_with_jwt_secret(self):
        """Dev environment starts when JWT secret is provided."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "development",
            "SONDER_JWT_SECRET": "any-dev-secret",
        })
        assert result.returncode == 0

    def test_missing_jwt_secret_fails(self):
        """App fails to start without SONDER_JWT_SECRET in any environment."""
        result = _run_config_module({})
        assert result.returncode == 1
