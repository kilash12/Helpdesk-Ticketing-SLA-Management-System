"""API views for the Helpdesk system."""
from __future__ import annotations

import logging
import os
import secrets
from datetime import timedelta

import bcrypt  # noqa: F401 - Django uses PBKDF2 by default, kept for compatibility
from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction, IntegrityError
from django.db.models import Count, Q, Avg, F
from django.utils import timezone
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .auth import set_auth_cookies, clear_auth_cookies
from .models import (
    AssignmentHistory, Attachment, AuditLog, Comment, CommentType, Department,
    Escalation, Feedback, LoginAttempt, Notification, PRIORITY_ORDER,
    PasswordResetToken, Priority, Role, SLARule, Ticket, TicketStatus,
    VALID_TRANSITIONS, User,
)
from .permissions import (
    IsAdmin, IsAdminOrAgent, IsAgent, IsCustomer, TicketAccessPermission,
)
from .serializers import (
    AssignmentHistorySerializer, AttachmentSerializer, AuditLogSerializer,
    ChangePasswordSerializer, CommentSerializer, DepartmentSerializer,
    EscalationSerializer, FeedbackSerializer, ForgotPasswordSerializer,
    LoginSerializer, NotificationSerializer, RegisterSerializer,
    ResetPasswordSerializer, SLARuleSerializer, TicketCreateSerializer,
    TicketDetailSerializer, TicketListSerializer, UserCreateSerializer,
    UserSerializer,
)
from .utils import apply_sla_on_create, log_audit, notify

logger = logging.getLogger("helpdesk")

MAX_UPLOAD_SIZE = 10 * 1024 * 1024
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".pdf", ".docx", ".txt", ".csv"}
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "application/vnd", "text/")


# ==========================================================================
# AUTH VIEWS
# ==========================================================================
def _issue_tokens_for(user) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["email"] = user.email
    return str(refresh.access_token), str(refresh)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        user = User(email=email, full_name=s.validated_data.get("full_name", ""), role=Role.CUSTOMER)
        user.set_password(s.validated_data["password"])
        user.save()
        access, refresh = _issue_tokens_for(user)
        log_audit(user, "register", "user", user.id, ip=getattr(request, "client_ip", None))
        resp = Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        set_auth_cookies(resp, access, refresh)
        return resp


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"].lower().strip()
        password = s.validated_data["password"]
        ip = getattr(request, "client_ip", None) or "unknown"
        identifier = f"{ip}:{email}"

        # Brute force check
        attempt = LoginAttempt.objects.filter(identifier=identifier).first()
        now = timezone.now()
        if attempt and attempt.locked_until and attempt.locked_until > now:
            return Response({"detail": "Account temporarily locked. Try again later."},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = User.objects.filter(email=email).first()
        if not user or not user.check_password(password) or not user.is_active:
            # increment
            attempt, _ = LoginAttempt.objects.get_or_create(identifier=identifier)
            attempt.failed_count = (attempt.failed_count or 0) + 1
            if attempt.failed_count >= 5:
                attempt.locked_until = now + timedelta(minutes=15)
                attempt.failed_count = 0
            attempt.save()
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

        # reset attempts
        if attempt:
            attempt.delete()

        access, refresh = _issue_tokens_for(user)
        log_audit(user, "login", "user", user.id, ip=ip)
        resp = Response(UserSerializer(user).data)
        set_auth_cookies(resp, access, refresh)
        return resp


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        resp = Response({"detail": "Logged out."})
        clear_auth_cookies(resp)
        log_audit(request.user, "logout", "user", request.user.id, ip=getattr(request, "client_ip", None))
        return resp


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh_str = request.COOKIES.get(settings.JWT_REFRESH_COOKIE)
        if not refresh_str:
            return Response({"detail": "Refresh token missing."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(refresh_str)
            # Rotate: get new access AND new refresh
            new_access = str(refresh.access_token)
            # Create new refresh (rotation)
            user_id = refresh["user_id"]
            user = User.objects.filter(id=user_id, is_active=True).first()
            if not user:
                raise TokenError("User not found")
            new_refresh_token = RefreshToken.for_user(user)
            new_refresh_token["role"] = user.role
            new_refresh_token["email"] = user.email
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)

        resp = Response({"detail": "Refreshed."})
        set_auth_cookies(resp, str(new_refresh_token.access_token), str(new_refresh_token))
        return resp


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(s.validated_data["old_password"]):
            return Response({"detail": "Old password incorrect."}, status=400)
        user.set_password(s.validated_data["new_password"])
        user.save()
        log_audit(user, "change_password", "user", user.id, ip=getattr(request, "client_ip", None))
        return Response({"detail": "Password changed."})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        s = ForgotPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"].lower().strip()
        user = User.objects.filter(email=email).first()
        if user:
            token = secrets.token_urlsafe(32)
            PasswordResetToken.objects.create(
                user=user, token=token, expires_at=timezone.now() + timedelta(hours=1)
            )
            reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            # MOCK EMAIL: log to console
            logger.info("[MOCK EMAIL] Password reset for %s: %s", email, reset_link)
            print(f"\n=== [MOCK EMAIL] Password Reset ===\nTo: {email}\nLink: {reset_link}\n=================\n")
        # Always return same response (no user enumeration)
        return Response({"detail": "If the email exists, a reset link has been sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        token_obj = PasswordResetToken.objects.filter(token=s.validated_data["token"]).first()
        if not token_obj or not token_obj.is_valid():
            return Response({"detail": "Invalid or expired token."}, status=400)
        user = token_obj.user
        user.set_password(s.validated_data["new_password"])
        user.save()
        token_obj.used = True
        token_obj.save()
        log_audit(user, "reset_password", "user", user.id, ip=getattr(request, "client_ip", None))
        return Response({"detail": "Password has been reset."})


# ==========================================================================
# DEPARTMENT
# ==========================================================================
class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdmin()]

    def destroy(self, request, *args, **kwargs):
        dept = self.get_object()
        # Cannot delete if any active (non-closed) ticket linked
        active_qs = dept.tickets.exclude(status=TicketStatus.CLOSED)
        if active_qs.exists():
            return Response(
                {"detail": "Cannot delete department with active tickets."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_audit(request.user, "delete", "department", dept.id, old=DepartmentSerializer(dept).data,
                  ip=getattr(request, "client_ip", None))
        return super().destroy(request, *args, **kwargs)


# ==========================================================================
# USER MGMT (Admin)
# ==========================================================================
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    permission_classes = [IsAuthenticated, IsAdmin]
    filterset_fields = ["role", "is_active", "department"]
    search_fields = ["email", "full_name"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer


class AgentListView(APIView):
    """List active agents (for assignment dropdown)."""
    permission_classes = [IsAuthenticated, IsAdminOrAgent]

    def get(self, request):
        qs = User.objects.filter(role=Role.AGENT, is_active=True)
        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(department_id=dept)
        return Response(UserSerializer(qs, many=True).data)


# ==========================================================================
# SLA RULES
# ==========================================================================
class SLARuleViewSet(viewsets.ModelViewSet):
    queryset = SLARule.objects.all()
    serializer_class = SLARuleSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdmin()]


# ==========================================================================
# TICKETS
# ==========================================================================
class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related("department", "assigned_agent", "created_by", "sla_rule")
    permission_classes = [IsAuthenticated, TicketAccessPermission]
    filterset_fields = ["status", "priority", "department", "assigned_agent"]
    search_fields = ["ticket_number", "subject"]
    ordering_fields = ["created_at", "updated_at", "priority"]

    def get_serializer_class(self):
        if self.action == "list":
            return TicketListSerializer
        if self.action == "create":
            return TicketCreateSerializer
        return TicketDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == Role.ADMIN:
            pass
        elif user.role == Role.AGENT:
            qs = qs.filter(Q(assigned_agent=user) | Q(department=user.department))
        elif user.role == Role.CUSTOMER:
            qs = qs.filter(created_by=user)
        else:
            qs = qs.none()

        # SLA breach filter
        sla_breach = self.request.query_params.get("sla_breach")
        now = timezone.now()
        if sla_breach == "true":
            qs = qs.filter(
                Q(resolved_at__isnull=True) & (
                    Q(resolution_due_at__lt=now) |
                    (Q(first_responded_at__isnull=True) & Q(first_response_due_at__lt=now))
                )
            )
        # date range
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__lte=date_to)
        return qs

    def create(self, request, *args, **kwargs):
        # Only customers can create via this endpoint (agents/admins can too for testing)
        s = TicketCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ticket = Ticket(**s.validated_data, created_by=request.user, status=TicketStatus.OPEN)
        apply_sla_on_create(ticket)
        ticket.save()
        log_audit(request.user, "create", "ticket", ticket.id,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        # Notify admins & department agents of new ticket
        for admin in User.objects.filter(role=Role.ADMIN, is_active=True):
            notify(admin, "ticket_new", f"New ticket {ticket.ticket_number}", ticket.subject, ticket=ticket,
                   dedupe_key=f"ticket_new:{ticket.id}:{admin.id}")
        return Response(TicketDetailSerializer(ticket).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        # Only admin can PATCH/PUT arbitrary fields; others use action endpoints
        ticket = self.get_object()
        if request.user.role != Role.ADMIN:
            raise PermissionDenied("Use ticket action endpoints to change status/priority/assignment.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != Role.ADMIN:
            raise PermissionDenied("Only admin can delete tickets.")
        return super().destroy(request, *args, **kwargs)

    # ---------- Ticket Actions ----------
    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role != Role.ADMIN:
            raise PermissionDenied("Only admin can assign tickets.")
        agent_id = request.data.get("agent_id")
        if not agent_id:
            raise ValidationError({"agent_id": "Required"})
        agent = User.objects.filter(id=agent_id, role=Role.AGENT, is_active=True).first()
        if not agent:
            raise ValidationError({"agent_id": "Agent not found or inactive."})
        if agent.department_id and ticket.department_id != agent.department_id:
            raise ValidationError({"agent_id": "Agent does not belong to ticket department."})

        old = TicketDetailSerializer(ticket).data
        prev_agent = ticket.assigned_agent
        ticket.assigned_agent = agent
        if ticket.status == TicketStatus.OPEN:
            ticket.status = TicketStatus.ASSIGNED
        ticket.save()
        AssignmentHistory.objects.create(
            ticket=ticket, from_agent=prev_agent, to_agent=agent, assigned_by=request.user
        )
        log_audit(request.user, "assign", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        notify(agent, "ticket_assigned", f"Ticket {ticket.ticket_number} assigned to you",
               ticket.subject, ticket=ticket, dedupe_key=f"assigned:{ticket.id}:{agent.id}:{timezone.now().timestamp()}")
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="self-assign")
    def self_assign(self, request, pk=None):
        # Concurrency-safe self-assign
        if request.user.role != Role.AGENT:
            raise PermissionDenied("Only agents can self-assign.")

        try:
            with transaction.atomic():
                # Lock the row (SQLite doesn't support SELECT FOR UPDATE; rely on atomic + check)
                ticket = Ticket.objects.select_for_update().get(pk=pk)

                # Access: must be in same department
                if request.user.department_id and ticket.department_id != request.user.department_id:
                    raise PermissionDenied("Ticket is not in your department.")

                if ticket.assigned_agent_id is not None:
                    return Response(
                        {"detail": "Ticket already assigned.", "assigned_agent": ticket.assigned_agent_id},
                        status=status.HTTP_409_CONFLICT,
                    )

                old = TicketDetailSerializer(ticket).data
                ticket.assigned_agent = request.user
                if ticket.status == TicketStatus.OPEN:
                    ticket.status = TicketStatus.ASSIGNED
                ticket.save()
                AssignmentHistory.objects.create(
                    ticket=ticket, from_agent=None, to_agent=request.user, assigned_by=request.user
                )
        except Ticket.DoesNotExist:
            raise NotFound("Ticket not found.")

        log_audit(request.user, "self_assign", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        ticket = self.get_object()
        new_status = request.data.get("status")
        if new_status not in TicketStatus.values:
            raise ValidationError({"status": "Invalid status."})
        if request.user.role == Role.CUSTOMER:
            # Customer can only close own or reopen resolved
            if new_status == TicketStatus.CLOSED and ticket.status == TicketStatus.RESOLVED and ticket.created_by_id == request.user.id:
                pass
            elif new_status == TicketStatus.REOPENED and ticket.status in (TicketStatus.RESOLVED, TicketStatus.CLOSED) and ticket.created_by_id == request.user.id:
                pass
            else:
                raise PermissionDenied("Customers cannot change to this status.")
        else:
            if request.user.role == Role.AGENT and ticket.assigned_agent_id != request.user.id and request.user.department_id != ticket.department_id:
                raise PermissionDenied("Not your ticket.")

        current = ticket.status
        allowed = VALID_TRANSITIONS.get(current, set())
        if new_status not in allowed:
            raise ValidationError({"status": f"Invalid transition {current} -> {new_status}."})

        old = TicketDetailSerializer(ticket).data
        ticket.status = new_status
        now = timezone.now()
        if new_status == TicketStatus.RESOLVED:
            ticket.resolved_at = now
        elif new_status == TicketStatus.CLOSED:
            ticket.closed_at = now
        elif new_status == TicketStatus.REOPENED:
            ticket.resolved_at = None
            ticket.closed_at = None
        ticket.save()
        log_audit(request.user, "status_change", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        # Notify creator
        if ticket.created_by_id != request.user.id:
            notify(ticket.created_by, "ticket_status", f"Ticket {ticket.ticket_number}: {new_status}",
                   f"Status changed to {new_status}", ticket=ticket)
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="change-priority")
    def change_priority(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == Role.CUSTOMER:
            raise PermissionDenied("Customers cannot change priority.")
        new_pri = request.data.get("priority")
        if new_pri not in Priority.values:
            raise ValidationError({"priority": "Invalid priority."})
        old = TicketDetailSerializer(ticket).data
        ticket.priority = new_pri
        ticket.save()
        log_audit(request.user, "priority_change", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="escalate")
    def escalate(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == Role.CUSTOMER:
            raise PermissionDenied("Customers cannot escalate.")
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason is required."})
        current_order = PRIORITY_ORDER[ticket.priority]
        if current_order >= PRIORITY_ORDER[Priority.CRITICAL]:
            raise ValidationError({"priority": "Already at highest priority."})
        # Increase priority by 1 level
        levels = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL]
        new_pri = levels[current_order]  # levels[current_order] is next
        old_pri = ticket.priority
        old = TicketDetailSerializer(ticket).data
        ticket.priority = new_pri
        ticket.status = TicketStatus.ESCALATED
        ticket.save()
        Escalation.objects.create(
            ticket=ticket, reason=reason, from_priority=old_pri, to_priority=new_pri,
            escalated_by=request.user,
        )
        log_audit(request.user, "escalate", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        # Notify admins
        for admin in User.objects.filter(role=Role.ADMIN, is_active=True):
            notify(admin, "ticket_escalated", f"Ticket {ticket.ticket_number} escalated",
                   reason, ticket=ticket, dedupe_key=f"escalate:{ticket.id}:{timezone.now().timestamp()}")
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == Role.CUSTOMER:
            raise PermissionDenied()
        if TicketStatus.RESOLVED not in VALID_TRANSITIONS.get(ticket.status, set()):
            raise ValidationError({"status": f"Cannot resolve from {ticket.status}."})
        old = TicketDetailSerializer(ticket).data
        ticket.status = TicketStatus.RESOLVED
        ticket.resolved_at = timezone.now()
        ticket.save()
        log_audit(request.user, "resolve", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        notify(ticket.created_by, "ticket_resolved", f"Ticket {ticket.ticket_number} resolved",
               "Your ticket has been resolved.", ticket=ticket,
               dedupe_key=f"resolved:{ticket.id}")
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        ticket = self.get_object()
        # Customer (owner) or admin/agent can reopen
        if request.user.role == Role.CUSTOMER and ticket.created_by_id != request.user.id:
            raise PermissionDenied()
        if ticket.status not in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
            raise ValidationError({"status": "Only resolved/closed tickets can be reopened."})
        old = TicketDetailSerializer(ticket).data
        ticket.status = TicketStatus.REOPENED
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.save()
        log_audit(request.user, "reopen", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == Role.CUSTOMER:
            if ticket.created_by_id != request.user.id:
                raise PermissionDenied()
        if TicketStatus.CLOSED not in VALID_TRANSITIONS.get(ticket.status, set()):
            raise ValidationError({"status": f"Cannot close from {ticket.status}."})
        old = TicketDetailSerializer(ticket).data
        ticket.status = TicketStatus.CLOSED
        ticket.closed_at = timezone.now()
        ticket.save()
        log_audit(request.user, "close", "ticket", ticket.id, old=old,
                  new=TicketDetailSerializer(ticket).data,
                  ip=getattr(request, "client_ip", None))
        return Response(TicketDetailSerializer(ticket).data)

    # ---------- Nested: comments, attachments ----------
    @action(detail=True, methods=["get", "post"], url_path="comments",
            permission_classes=[IsAuthenticated, TicketAccessPermission])
    def comments(self, request, pk=None):
        ticket = self.get_object()
        if request.method == "GET":
            qs = ticket.comments.all()
            if request.user.role == Role.CUSTOMER:
                qs = qs.filter(comment_type=CommentType.PUBLIC)
            return Response(CommentSerializer(qs, many=True).data)

        # POST: create comment
        comment_type = request.data.get("comment_type", CommentType.PUBLIC)
        if comment_type not in CommentType.values:
            raise ValidationError({"comment_type": "Invalid type."})
        if request.user.role == Role.CUSTOMER and comment_type != CommentType.PUBLIC:
            raise PermissionDenied("Customers can only post public replies.")
        message = (request.data.get("message") or "").strip()
        if not message:
            raise ValidationError({"message": "Required."})
        c = Comment.objects.create(
            ticket=ticket, message=message, comment_type=comment_type, created_by=request.user
        )
        # First response tracking (agent public reply)
        if request.user.role in (Role.AGENT, Role.ADMIN) and comment_type == CommentType.PUBLIC and not ticket.first_responded_at:
            ticket.first_responded_at = timezone.now()
            ticket.save(update_fields=["first_responded_at"])
        log_audit(request.user, "comment_add", "ticket", ticket.id,
                  new={"comment_id": c.id, "type": comment_type},
                  ip=getattr(request, "client_ip", None))
        # Notify participants
        if comment_type == CommentType.PUBLIC:
            recipients = set()
            if ticket.created_by_id != request.user.id:
                recipients.add(ticket.created_by)
            if ticket.assigned_agent_id and ticket.assigned_agent_id != request.user.id:
                recipients.add(ticket.assigned_agent)
            for u in recipients:
                notify(u, "new_reply", f"New reply on {ticket.ticket_number}", message[:120],
                       ticket=ticket, dedupe_key=f"reply:{c.id}:{u.id}")
        else:  # internal - notify agents/admins in dept
            for u in User.objects.filter(Q(role=Role.ADMIN) | Q(role=Role.AGENT, department=ticket.department)).exclude(id=request.user.id):
                notify(u, "internal_note", f"Internal note on {ticket.ticket_number}", message[:120],
                       ticket=ticket, dedupe_key=f"internal:{c.id}:{u.id}")
        return Response(CommentSerializer(c).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="attachments",
            permission_classes=[IsAuthenticated, TicketAccessPermission])
    def attachments(self, request, pk=None):
        ticket = self.get_object()
        if request.method == "GET":
            return Response(AttachmentSerializer(ticket.attachments.all(), many=True, context={"request": request}).data)
        # POST upload
        f = request.FILES.get("file")
        if not f:
            raise ValidationError({"file": "File is required."})
        # Validate size
        if f.size == 0:
            raise ValidationError({"file": "File is empty."})
        if f.size > MAX_UPLOAD_SIZE:
            raise ValidationError({"file": "File exceeds 10 MB limit."})
        # Validate extension
        name = f.name or ""
        # Filename safety: no path traversal, no null bytes
        if "/" in name or "\\" in name or "\x00" in name or ".." in name:
            raise ValidationError({"file": "Unsafe filename."})
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_EXTS:
            raise ValidationError({"file": f"Extension {ext} not allowed."})
        # Validate MIME type prefix
        ct = f.content_type or ""
        if not any(ct.startswith(pref) for pref in ALLOWED_MIME_PREFIXES):
            raise ValidationError({"file": f"MIME type {ct} not allowed."})
        att = Attachment.objects.create(
            ticket=ticket, file=f, filename=name, content_type=ct, size=f.size, uploaded_by=request.user
        )
        log_audit(request.user, "attachment_add", "ticket", ticket.id,
                  new={"attachment_id": att.id, "filename": name},
                  ip=getattr(request, "client_ip", None))
        return Response(AttachmentSerializer(att, context={"request": request}).data, status=201)

    @action(detail=True, methods=["get", "post"], url_path="feedback",
            permission_classes=[IsAuthenticated, TicketAccessPermission])
    def feedback(self, request, pk=None):
        ticket = self.get_object()
        if request.method == "GET":
            if hasattr(ticket, "feedback"):
                return Response(FeedbackSerializer(ticket.feedback).data)
            return Response(None)
        # POST
        if ticket.created_by_id != request.user.id:
            raise PermissionDenied("Only the ticket owner can submit feedback.")
        if ticket.status not in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
            raise ValidationError({"detail": "Feedback only for resolved/closed tickets."})
        if hasattr(ticket, "feedback"):
            raise ValidationError({"detail": "Feedback already submitted."})
        s = FeedbackSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        fb = Feedback.objects.create(
            ticket=ticket, rating=s.validated_data["rating"],
            comment=s.validated_data.get("comment", ""),
            created_by=request.user,
        )
        log_audit(request.user, "feedback_add", "ticket", ticket.id,
                  new={"rating": fb.rating},
                  ip=getattr(request, "client_ip", None))
        return Response(FeedbackSerializer(fb).data, status=201)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        ticket = self.get_object()
        return Response({
            "assignments": AssignmentHistorySerializer(ticket.assignment_history.all(), many=True).data,
            "escalations": EscalationSerializer(ticket.escalations.all(), many=True).data,
        })


# ==========================================================================
# NOTIFICATIONS
# ==========================================================================
class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        n = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"unread_count": n})

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        n = self.get_queryset().filter(pk=pk).first()
        if not n:
            raise NotFound()
        n.is_read = True
        n.save()
        return Response(NotificationSerializer(n).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"detail": "All marked as read."})


# ==========================================================================
# AUDIT LOGS (read-only)
# ==========================================================================
class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filterset_fields = ["action", "entity_type", "user"]
    search_fields = ["action", "entity_type", "entity_id"]


# ==========================================================================
# REPORTS
# ==========================================================================
class ReportsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrAgent]

    def get(self, request, kind):
        now = timezone.now()
        if kind == "dashboard":
            qs = Ticket.objects.all()
            if request.user.role == Role.AGENT:
                qs = qs.filter(Q(assigned_agent=request.user) | Q(department=request.user.department))
            data = {
                "total": qs.count(),
                "open": qs.filter(status=TicketStatus.OPEN).count(),
                "in_progress": qs.filter(status=TicketStatus.IN_PROGRESS).count(),
                "waiting_customer": qs.filter(status=TicketStatus.WAITING_CUSTOMER).count(),
                "escalated": qs.filter(status=TicketStatus.ESCALATED).count(),
                "resolved": qs.filter(status=TicketStatus.RESOLVED).count(),
                "closed": qs.filter(status=TicketStatus.CLOSED).count(),
                "reopened": qs.filter(status=TicketStatus.REOPENED).count(),
                "assigned": qs.filter(status=TicketStatus.ASSIGNED).count(),
                "unassigned": qs.filter(assigned_agent__isnull=True).exclude(status=TicketStatus.CLOSED).count(),
                "sla_breached": qs.filter(
                    Q(resolved_at__isnull=True) & (
                        Q(resolution_due_at__lt=now) |
                        (Q(first_responded_at__isnull=True) & Q(first_response_due_at__lt=now))
                    )
                ).count(),
                "by_priority": list(qs.values("priority").annotate(count=Count("id"))),
                "by_department": list(qs.values("department__name").annotate(count=Count("id"))),
            }
            return Response(data)
        if kind == "agent-performance":
            data = list(
                User.objects.filter(role=Role.AGENT).annotate(
                    total=Count("tickets_assigned"),
                    resolved=Count("tickets_assigned", filter=Q(tickets_assigned__status__in=[TicketStatus.RESOLVED, TicketStatus.CLOSED])),
                    avg_rating=Avg("tickets_assigned__feedback__rating"),
                ).values("id", "email", "full_name", "total", "resolved", "avg_rating")
            )
            return Response(data)
        if kind == "sla-summary":
            qs = Ticket.objects.exclude(status=TicketStatus.CLOSED)
            data = {
                "total_active": qs.count(),
                "breached_first_response": qs.filter(breached_first_response=True).count(),
                "breached_resolution": qs.filter(breached_resolution=True).count(),
                "warned_first_response": qs.filter(warned_first_response=True).count(),
                "warned_resolution": qs.filter(warned_resolution=True).count(),
            }
            return Response(data)
        if kind == "ticket-trends":
            from django.db.models.functions import TruncDate
            data = list(
                Ticket.objects.annotate(day=TruncDate("created_at"))
                .values("day").annotate(count=Count("id")).order_by("day")[:60]
            )
            return Response(data)
        raise NotFound()
