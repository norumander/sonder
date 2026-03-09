"""Smoke test to verify the test runner and app startup."""

import pytest


@pytest.mark.anyio
async def test_health_endpoint_returns_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
