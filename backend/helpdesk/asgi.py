"""ASGI config for helpdesk project."""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "helpdesk.settings")

from django.core.asgi import get_asgi_application  # noqa: E402

application = get_asgi_application()
