"""Server-Sent Events (SSE) for real-time notification updates.

Polls the DB every 3 seconds for new notifications for the current user
and streams them. Simpler than WebSockets and works over standard HTTP.
"""
import json
import time

from django.http import StreamingHttpResponse, HttpResponseForbidden
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import Notification, User
from django.conf import settings


def _get_user_from_request(request):
    token = request.COOKIES.get(settings.JWT_ACCESS_COOKIE)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        validated = UntypedToken(token)
        user_id = validated["user_id"]
    except (TokenError, KeyError):
        return None
    return User.objects.filter(id=user_id, is_active=True).first()


def notifications_stream(request):
    user = _get_user_from_request(request)
    if not user:
        return HttpResponseForbidden("Unauthorized")

    def event_stream(user_id):
        # send last id as starting point
        last_id = Notification.objects.filter(user_id=user_id).order_by("-id").values_list("id", flat=True).first() or 0
        # initial keep-alive
        yield f": connected\n\n"
        for _ in range(600):  # ~30 min max
            new = list(
                Notification.objects.filter(user_id=user_id, id__gt=last_id).order_by("id").values(
                    "id", "kind", "title", "body", "ticket_id", "is_read", "created_at"
                )
            )
            for n in new:
                n["created_at"] = n["created_at"].isoformat()
                yield f"event: notification\ndata: {json.dumps(n)}\n\n"
                last_id = n["id"]
            # heartbeat
            yield ": ping\n\n"
            time.sleep(3)

    resp = StreamingHttpResponse(event_stream(user.id), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp
