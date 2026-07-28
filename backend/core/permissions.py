"""Role-based permission classes."""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.ADMIN)


class IsAgent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.AGENT)


class IsAdminOrAgent(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.ADMIN, Role.AGENT)
        )


class IsCustomer(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CUSTOMER)


class TicketAccessPermission(BasePermission):
    """
    - Admin: all tickets
    - Agent: tickets in their department OR assigned to them
    - Customer: only tickets they created
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == Role.ADMIN:
            return True
        if user.role == Role.AGENT:
            return (obj.assigned_agent_id == user.id) or (
                user.department_id and obj.department_id == user.department_id
            )
        if user.role == Role.CUSTOMER:
            return obj.created_by_id == user.id
        return False
