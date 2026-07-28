"""URL routes."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .sse import notifications_stream

router = DefaultRouter()
router.register(r"tickets", views.TicketViewSet, basename="ticket")
router.register(r"departments", views.DepartmentViewSet, basename="department")
router.register(r"users", views.UserViewSet, basename="user")
router.register(r"sla-rules", views.SLARuleViewSet, basename="sla-rule")
router.register(r"notifications", views.NotificationViewSet, basename="notification")
router.register(r"audit-logs", views.AuditLogViewSet, basename="audit-log")

auth_patterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("refresh/", views.RefreshView.as_view(), name="refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("forgot-password/", views.ForgotPasswordView.as_view(), name="forgot-password"),
    path("reset-password/", views.ResetPasswordView.as_view(), name="reset-password"),
]

urlpatterns = [
    path("", include(router.urls)),
    path("auth/", include(auth_patterns)),
    path("agents/", views.AgentListView.as_view(), name="agents"),
    path("reports/<str:kind>/", views.ReportsView.as_view(), name="reports"),
    path("events/notifications/", notifications_stream, name="sse-notifications"),
]
