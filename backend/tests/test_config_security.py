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

    def test_production_rejects_default_jwt_secret(self):
        """App exits with code 1 when JWT secret is default in production."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "production",
            "SONDER_JWT_SECRET": "dev-secret-change-in-production",
            "SONDER_GOOGLE_CLIENT_ID": "some-client-id",
        })
        assert result.returncode == 1
        assert "SONDER_JWT_SECRET" in result.stderr

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

    def test_development_allows_default_jwt_secret(self):
        """Dev environment allows default JWT secret (warning only, no exit)."""
        result = _run_config_module({
            "SONDER_ENVIRONMENT": "development",
        })
        assert result.returncode == 0

    def test_no_environment_defaults_to_development(self):
        """Without SONDER_ENVIRONMENT, defaults to development (no exit)."""
        result = _run_config_module({})
        assert result.returncode == 0
