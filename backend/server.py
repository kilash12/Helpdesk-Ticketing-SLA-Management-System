"""ASGI entrypoint for uvicorn (server:app).

Supervisor runs: uvicorn server:app --host 0.0.0.0 --port 8001
"""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "helpdesk.settings")

# Run migrations & bootstrap admin at import time (idempotent)
import django  # noqa: E402
django.setup()

from django.core.management import call_command  # noqa: E402
try:
    call_command("migrate", interactive=False, verbosity=0)
except Exception as e:  # noqa: BLE001
    print(f"[startup] migrate failed: {e}")

from core.bootstrap import bootstrap  # noqa: E402
try:
    bootstrap()
except Exception as e:  # noqa: BLE001
    print(f"[startup] bootstrap failed: {e}")

from core.jobs import start_scheduler  # noqa: E402
try:
    start_scheduler()
except Exception as e:  # noqa: BLE001
    print(f"[startup] scheduler failed: {e}")

from helpdesk.asgi import application as app  # noqa: E402,F401
