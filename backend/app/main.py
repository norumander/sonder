"""FastAPI application entry point."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure logging so app loggers (INFO+) are visible
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from app.auth.router import router as auth_router
from app.config import settings
from app.preferences.router import router as preferences_router
from app.prerecorded.router import router as prerecorded_router
from app.sessions.router import router as sessions_router
from app.trends.router import router as trends_router
from app.websocket.handler import router as ws_router

app = FastAPI(title="Sonder", description="AI-powered live tutoring session analysis")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(preferences_router)
app.include_router(prerecorded_router)
app.include_router(sessions_router)
app.include_router(trends_router)
app.include_router(ws_router)


@app.exception_handler(401)
async def unauthorized_handler(request: Request, exc):
    """Return {detail, code} format for 401 errors."""
    code = "UNAUTHORIZED"
    if hasattr(exc, "headers") and exc.headers:
        code = exc.headers.get("code", code)
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc.detail), "code": code},
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
