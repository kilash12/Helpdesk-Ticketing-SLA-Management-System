"""APScheduler background jobs.

Runs in the same process as the web server (single worker via supervisor).
Jobs:
  - check_sla: mark warnings/breaches, emit notifications (idempotent)
  - auto_close: close resolved tickets after AUTO_CLOSE_HOURS
"""
import logging
from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger("helpdesk")

_scheduler = None


def check_sla():
    from .models import Ticket, TicketStatus, User, Role
    from .utils import notify

    now = timezone.now()
    active = Ticket.objects.exclude(status__in=[TicketStatus.CLOSED, TicketStatus.RESOLVED])

    for t in active.filter(first_response_due_at__isnull=False, first_responded_at__isnull=True):
        remaining = (t.first_response_due_at - now).total_seconds()
        total = (t.sla_first_response_minutes or 1) * 60
        # Warning: <20% remaining and not yet warned
        if 0 < remaining < 0.2 * total and not t.warned_first_response:
            t.warned_first_response = True
            t.save(update_fields=["warned_first_response"])
            _notify_sla_target(t, "sla_warning_first_response",
                               f"SLA warning: {t.ticket_number}",
                               f"First response due in {int(remaining/60)} min")
        # Breach
        if remaining <= 0 and not t.breached_first_response:
            t.breached_first_response = True
            t.save(update_fields=["breached_first_response"])
            _notify_sla_target(t, "sla_breach_first_response",
                               f"SLA breach: {t.ticket_number}",
                               "First response deadline missed")

    for t in active.filter(resolution_due_at__isnull=False):
        remaining = (t.resolution_due_at - now).total_seconds()
        total = (t.sla_resolution_minutes or 1) * 60
        if 0 < remaining < 0.2 * total and not t.warned_resolution:
            t.warned_resolution = True
            t.save(update_fields=["warned_resolution"])
            _notify_sla_target(t, "sla_warning_resolution",
                               f"SLA warning: {t.ticket_number}",
                               f"Resolution due in {int(remaining/60)} min")
        if remaining <= 0 and not t.breached_resolution:
            t.breached_resolution = True
            t.save(update_fields=["breached_resolution"])
            _notify_sla_target(t, "sla_breach_resolution",
                               f"SLA breach: {t.ticket_number}",
                               "Resolution deadline missed")


def _notify_sla_target(ticket, kind, title, body):
    from .models import User, Role
    from .utils import notify

    targets = set()
    if ticket.assigned_agent_id:
        targets.add(ticket.assigned_agent)
    for u in User.objects.filter(role=Role.ADMIN, is_active=True):
        targets.add(u)
    for u in targets:
        notify(u, kind, title, body, ticket=ticket, dedupe_key=f"{kind}:{ticket.id}:{u.id}")


def auto_close():
    from .models import Ticket, TicketStatus
    from .utils import log_audit

    cutoff = timezone.now() - timedelta(hours=settings.AUTO_CLOSE_HOURS)
    qs = Ticket.objects.filter(status=TicketStatus.RESOLVED, resolved_at__lt=cutoff)
    count = 0
    for t in qs:
        t.status = TicketStatus.CLOSED
        t.closed_at = timezone.now()
        t.save(update_fields=["status", "closed_at"])
        log_audit(None, "auto_close", "ticket", t.id, new={"status": "closed"})
        count += 1
    if count:
        logger.info("auto_close closed %d tickets", count)


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    sched = BackgroundScheduler(timezone="UTC")
    sched.add_job(check_sla, "interval", minutes=1, id="check_sla", max_instances=1, coalesce=True, replace_existing=True)
    sched.add_job(auto_close, "interval", minutes=30, id="auto_close", max_instances=1, coalesce=True, replace_existing=True)
    sched.start()
    _scheduler = sched
    logger.info("APScheduler started")
    return sched
