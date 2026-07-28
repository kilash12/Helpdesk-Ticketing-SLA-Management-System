"""DRF serializers."""
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import (
    AssignmentHistory, Attachment, AuditLog, Comment, CommentType, Department,
    Escalation, Feedback, Notification, PRIORITY_ORDER, Priority, Role, SLARule,
    Ticket, TicketStatus, User,
)


class UserSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "department", "department_name",
                  "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "password", "role", "department", "is_active"]
        read_only_fields = ["id"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SLARuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SLARule
        fields = ["id", "priority", "first_response_minutes", "resolution_minutes",
                  "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CommentSerializer(serializers.ModelSerializer):
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    created_by_role = serializers.CharField(source="created_by.role", read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "ticket", "message", "comment_type", "created_by",
                  "created_by_email", "created_by_name", "created_by_role", "created_at"]
        read_only_fields = ["id", "created_by", "created_at", "ticket"]


class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "ticket", "filename", "content_type", "size", "file_url",
                  "uploaded_by", "created_at"]
        read_only_fields = ["id", "content_type", "size", "file_url", "uploaded_by", "created_at", "ticket"]

    def get_file_url(self, obj):
        request = self.context.get("request")
        try:
            url = obj.file.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url


class EscalationSerializer(serializers.ModelSerializer):
    escalated_by_email = serializers.CharField(source="escalated_by.email", read_only=True)

    class Meta:
        model = Escalation
        fields = ["id", "ticket", "reason", "from_priority", "to_priority",
                  "escalated_by", "escalated_by_email", "created_at"]
        read_only_fields = fields


class AssignmentHistorySerializer(serializers.ModelSerializer):
    from_agent_email = serializers.CharField(source="from_agent.email", read_only=True, default=None)
    to_agent_email = serializers.CharField(source="to_agent.email", read_only=True, default=None)
    assigned_by_email = serializers.CharField(source="assigned_by.email", read_only=True)

    class Meta:
        model = AssignmentHistory
        fields = ["id", "ticket", "from_agent", "to_agent", "assigned_by",
                  "from_agent_email", "to_agent_email", "assigned_by_email", "created_at"]


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = ["id", "ticket", "rating", "comment", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at", "ticket"]

    def validate_rating(self, v):
        if v < 1 or v > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return v


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "ticket", "is_read", "created_at"]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_email", "action", "entity_type", "entity_id",
                  "old_value", "new_value", "ip_address", "created_at"]
        read_only_fields = fields


class TicketListSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)
    assigned_agent_email = serializers.CharField(source="assigned_agent.email", read_only=True, default=None)

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "subject", "department", "department_name",
            "priority", "status", "created_by", "created_by_email",
            "assigned_agent", "assigned_agent_email",
            "first_response_due_at", "resolution_due_at",
            "first_responded_at", "resolved_at", "closed_at",
            "created_at", "updated_at",
        ]


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ["subject", "description", "department", "priority"]


class TicketDetailSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    assigned_agent_email = serializers.CharField(source="assigned_agent.email", read_only=True, default=None)
    assigned_agent_name = serializers.CharField(source="assigned_agent.full_name", read_only=True, default=None)
    sla_rule_data = SLARuleSerializer(source="sla_rule", read_only=True)
    has_feedback = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "subject", "description",
            "department", "department_name",
            "priority", "status",
            "created_by", "created_by_email", "created_by_name",
            "assigned_agent", "assigned_agent_email", "assigned_agent_name",
            "sla_rule", "sla_rule_data",
            "sla_first_response_minutes", "sla_resolution_minutes",
            "first_response_due_at", "resolution_due_at",
            "first_responded_at", "resolved_at", "closed_at",
            "has_feedback",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_has_feedback(self, obj):
        return hasattr(obj, "feedback")
