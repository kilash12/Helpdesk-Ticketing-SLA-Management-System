"""Bootstrap: seed default admin, departments, SLA rules on startup."""
import logging

from django.conf import settings

logger = logging.getLogger("helpdesk")


def bootstrap():
    from .models import User, Role, Department, SLARule, Priority

    email = settings.ADMIN_EMAIL
    password = settings.ADMIN_PASSWORD

    admin, created = User.objects.get_or_create(
        email=email,
        defaults={"full_name": "System Admin", "role": Role.ADMIN, "is_staff": True, "is_superuser": True},
    )
    if created:
        admin.set_password(password)
        admin.save()
        logger.info("Seeded admin %s", email)
    else:
        # keep password in sync with .env
        if not admin.check_password(password):
            admin.set_password(password)
            admin.save()

    # Default departments
    for name, desc in [
        ("General Support", "General customer inquiries"),
        ("Technical", "Technical / product issues"),
        ("Billing", "Billing and payment questions"),
    ]:
        Department.objects.get_or_create(name=name, defaults={"description": desc, "is_active": True})

    # Default SLA rules (in minutes)
    defaults = {
        Priority.LOW: (240, 60 * 24 * 5),        # 4h first response, 5d resolution
        Priority.MEDIUM: (120, 60 * 24 * 2),     # 2h first response, 2d resolution
        Priority.HIGH: (60, 60 * 8),             # 1h first response, 8h resolution
        Priority.CRITICAL: (15, 60 * 4),         # 15m first response, 4h resolution
    }
    for pri, (fr, res) in defaults.items():
        SLARule.objects.get_or_create(
            priority=pri, defaults={"first_response_minutes": fr, "resolution_minutes": res, "is_active": True}
        )

    # Seed one agent + one customer for testing
    default_dept = Department.objects.filter(name="Technical").first()
    agent, was_new = User.objects.get_or_create(
        email="agent@helpdesk.com",
        defaults={"full_name": "Alex Agent", "role": Role.AGENT, "department": default_dept},
    )
    if was_new:
        agent.set_password("Agent@123")
        agent.save()

    cust, was_new = User.objects.get_or_create(
        email="customer@helpdesk.com",
        defaults={"full_name": "Casey Customer", "role": Role.CUSTOMER},
    )
    if was_new:
        cust.set_password("Customer@123")
        cust.save()
