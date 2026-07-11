"""
Thin entry point so `uvicorn main:app` and `gunicorn main:app -k uvicorn.workers.UvicornWorker`
work from the `backend/` directory (Implementation Plan Section 11, Deployment Notes).

The actual FastAPI app instance lives in app/main.py, per Section 3's project
structure. `uvicorn app.main:app` works equally well; this just matches the
convention deployment tooling often expects at the repo root.
"""
from app.main import app  # noqa: F401
