"""Cookie-based JWT authentication for DRF.

Reads access_token from HTTP-only cookie; falls back to Authorization header.
"""
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = None
        cookie_name = getattr(settings, "JWT_ACCESS_COOKIE", "access_token")
        raw_token = request.COOKIES.get(cookie_name)

        if not raw_token:
            header = self.get_header(request)
            if header is not None:
                raw_token = self.get_raw_token(header)

        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)
        if not user or not user.is_active:
            return None
        return (user, validated_token)


def set_auth_cookies(response, access: str, refresh: str) -> None:
    """Attach access and refresh JWT cookies to a response."""
    response.set_cookie(
        key=settings.JWT_ACCESS_COOKIE,
        value=access,
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path="/",
    )
    response.set_cookie(
        key=settings.JWT_REFRESH_COOKIE,
        value=refresh,
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path="/",
    )


def clear_auth_cookies(response) -> None:
    response.delete_cookie(settings.JWT_ACCESS_COOKIE, path="/", samesite=settings.JWT_COOKIE_SAMESITE)
    response.delete_cookie(settings.JWT_REFRESH_COOKIE, path="/", samesite=settings.JWT_COOKIE_SAMESITE)
