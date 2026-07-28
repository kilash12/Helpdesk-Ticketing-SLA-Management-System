"""Helper utilities: audit logging, notifications, SLA."""
from datetime import timedelta

from django.utils import timezone

from .models import AuditLog, Notification, SLARule, Priority


def log_audit(user, action: str, entity_type: str, entity_id, old=None, new=None, ip=None):
    AuditLog.objects.create(
        user=user if user and getattr(user, "is_authenticated", False) else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else "",
        old_value=old,
        new_value=new,
        ip_address=ip,
    )


def notify(user, kind: str, title: str, body: str = "", ticket=None, dedupe_key: str = ""):
    """Create a notification. If dedupe_key is set, avoid duplicates per (user, dedupe_key)."""
    if dedupe_key:
        existing = Notification.objects.filter(user=user, dedupe_key=dedupe_key).first()
        if existing:
            return existing
    return Notification.objects.create(
        user=user, kind=kind, title=title, body=body, ticket=ticket, dedupe_key=dedupe_key
    )


def apply_sla_on_create(ticket):
    """Assign active SLA rule to ticket at creation. Store snapshot and due timestamps."""
    rule = SLARule.objects.filter(priority=ticket.priority, is_active=True).first()
    if not rule:
        return
    ticket.sla_rule = rule
    ticket.sla_first_response_minutes = rule.first_response_minutes
    ticket.sla_resolution_minutes = rule.resolution_minutes
    now = timezone.now()
    ticket.first_response_due_at = now + timedelta(minutes=rule.first_response_minutes)
    ticket.resolution_due_at = now + timedelta(minutes=rule.resolution_minutes)
