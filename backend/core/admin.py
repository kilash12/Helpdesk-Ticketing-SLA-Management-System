"""Register models with Django admin (bonus)."""
from django.contrib import admin

from .models import (
    AssignmentHistory, Attachment, AuditLog, Comment, Department,
    Escalation, Feedback, Notification, PasswordResetToken, SLARule, Ticket, User,
)

for m in [User, Department, SLARule, Ticket, Comment, Attachment, Escalation,
          AssignmentHistory, Feedback, AuditLog, Notification, PasswordResetToken]:
    try:
        admin.site.register(m)
    except admin.sites.AlreadyRegistered:
        pass
