"""End-to-end backend API tests for the Helpdesk system.

Uses live external URL from REACT_APP_BACKEND_URL. Session-based cookie auth
(JWT stored in HTTP-only cookies).
"""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sla-ticket-system-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@helpdesk.com", "password": "Admin@123"}
AGENT = {"email": "agent@helpdesk.com", "password": "Agent@123"}
CUSTOMER = {"email": "customer@helpdesk.com", "password": "Customer@123"}


def _client(creds=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if creds:
        r = s.post(f"{API}/auth/login/", json=creds, timeout=15)
        assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


# ----------------- AUTH -----------------
class TestAuth:
    def test_login_admin(self):
        s = _client()
        r = s.post(f"{API}/auth/login/", json=ADMIN)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
        assert "access_token" in s.cookies or any("access_token" in c.name for c in s.cookies)

    def test_login_agent(self):
        r = requests.post(f"{API}/auth/login/", json=AGENT)
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "agent"

    def test_login_customer(self):
        r = requests.post(f"{API}/auth/login/", json=CUSTOMER)
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "customer"

    def test_me_after_login(self):
        s = _client(ADMIN)
        r = s.get(f"{API}/auth/me/")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me/")
        assert r.status_code == 401

    def test_refresh_rotates(self):
        s = _client(ADMIN)
        old_refresh = s.cookies.get("refresh_token")
        r = s.post(f"{API}/auth/refresh/")
        assert r.status_code == 200
        new_refresh = s.cookies.get("refresh_token")
        assert new_refresh and new_refresh != old_refresh, "Refresh token was not rotated"

    def test_logout_clears_cookies(self):
        s = _client(ADMIN)
        r = s.post(f"{API}/auth/logout/")
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me/")
        assert r2.status_code == 401

    def test_register_creates_customer(self):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register/", json={
            "email": email, "password": "Passw0rd!", "full_name": "Reg Test"
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["role"] == "customer"
        assert data["email"] == email
        # cookies set
        me = s.get(f"{API}/auth/me/")
        assert me.status_code == 200

    def test_change_password(self):
        # create fresh user
        email = f"TEST_chpw_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register/", json={
            "email": email, "password": "OldPass1!", "full_name": "X"
        })
        assert r.status_code == 201
        r = s.post(f"{API}/auth/change-password/", json={
            "old_password": "OldPass1!", "new_password": "NewPass2!"
        })
        assert r.status_code == 200, r.text
        # login with new password
        r2 = requests.post(f"{API}/auth/login/", json={"email": email, "password": "NewPass2!"})
        assert r2.status_code == 200

    def test_forgot_password_no_enumeration(self):
        # non-existent email should still return 200
        r = requests.post(f"{API}/auth/forgot-password/", json={"email": "nope@nowhere.zzz"})
        assert r.status_code == 200

    def test_brute_force_lockout(self):
        # Use unique email to avoid impacting other tests
        email = f"TEST_bf_{uuid.uuid4().hex[:8]}@example.com"
        # Register real user
        requests.post(f"{API}/auth/register/", json={
            "email": email, "password": "RealPw1!", "full_name": "BF"
        })
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login/", json={"email": email, "password": "WRONGpw!"})
            codes.append(r.status_code)
        # After 5 failed, next should be 429
        assert 429 in codes, f"Expected 429 lockout, got sequence {codes}"


# ----------------- TICKETS -----------------
@pytest.fixture(scope="module")
def customer_session():
    return _client(CUSTOMER)


@pytest.fixture(scope="module")
def admin_session():
    return _client(ADMIN)


@pytest.fixture(scope="module")
def agent_session():
    return _client(AGENT)


@pytest.fixture(scope="module")
def technical_dept_id(admin_session):
    r = admin_session.get(f"{API}/departments/")
    assert r.status_code == 200
    depts = r.json()
    if isinstance(depts, dict) and "results" in depts:
        depts = depts["results"]
    tech = next((d for d in depts if d["name"] == "Technical"), None)
    assert tech, "Technical department not found"
    return tech["id"]


class TestTickets:
    def test_customer_create_ticket(self, customer_session, technical_dept_id):
        r = customer_session.post(f"{API}/tickets/", json={
            "subject": "TEST_Ticket subject",
            "description": "Some description",
            "priority": "medium",
            "department": technical_dept_id,
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["ticket_number"].startswith("TKT-"), data["ticket_number"]
        assert data["sla_first_response_minutes"] is not None
        assert data["sla_resolution_minutes"] is not None
        assert data["first_response_due_at"]
        assert data["resolution_due_at"]
        pytest.customer_ticket_id = data["id"]

    def test_customer_sees_only_own(self, customer_session):
        r = customer_session.get(f"{API}/tickets/")
        assert r.status_code == 200
        results = r.json()
        if isinstance(results, dict) and "results" in results:
            results = results["results"]
        # all should be owned by customer
        for t in results:
            # created_by may be dict or id
            cb = t.get("created_by")
            if isinstance(cb, dict):
                assert cb.get("email") == CUSTOMER["email"]

    def test_customer_cannot_see_others_ticket(self, customer_session, admin_session, technical_dept_id):
        # Admin creates a ticket
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_admin owned", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        assert r.status_code == 201
        tid = r.json()["id"]
        r2 = customer_session.get(f"{API}/tickets/{tid}/")
        assert r2.status_code == 404, f"Expected 404 for IDOR, got {r2.status_code}"

    def test_invalid_status_transition(self, admin_session, technical_dept_id):
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_trans", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        tid = r.json()["id"]
        # open->closed is invalid
        r2 = admin_session.post(f"{API}/tickets/{tid}/change-status/", json={"status": "closed"})
        assert r2.status_code == 400
        body = r2.json()
        assert "Invalid transition" in str(body), body

    def test_valid_status_flow(self, admin_session, agent_session, technical_dept_id):
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_flow", "description": "x",
            "priority": "medium", "department": technical_dept_id
        })
        tid = r.json()["id"]
        # self-assign as agent -> open->assigned
        r2 = agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "assigned"
        # assigned->in_progress
        r3 = agent_session.post(f"{API}/tickets/{tid}/change-status/", json={"status": "in_progress"})
        assert r3.status_code == 200, r3.text
        # in_progress->resolved via resolve endpoint
        r4 = agent_session.post(f"{API}/tickets/{tid}/resolve/")
        assert r4.status_code == 200, r4.text
        assert r4.json()["status"] == "resolved"
        # resolved->closed
        r5 = agent_session.post(f"{API}/tickets/{tid}/change-status/", json={"status": "closed"})
        assert r5.status_code == 200, r5.text

    def test_self_assign_concurrency(self, admin_session, agent_session, technical_dept_id):
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_conc", "description": "x",
            "priority": "medium", "department": technical_dept_id
        })
        tid = r.json()["id"]
        # first self-assign
        r1 = agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        assert r1.status_code == 200
        # second time - admin trying self assign will 403 (not agent), so second agent scenario:
        # use same agent trying to self assign again -> should 409 (already assigned)
        r2 = agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        assert r2.status_code == 409, r2.text
        assert "already assigned" in r2.text.lower()

    def test_agent_wrong_dept_self_assign(self, admin_session, agent_session):
        # Create ticket in Billing (not Technical - agent's dept)
        r = admin_session.get(f"{API}/departments/")
        depts = r.json()
        if isinstance(depts, dict) and "results" in depts:
            depts = depts["results"]
        billing = next((d for d in depts if d["name"] == "Billing"), None)
        if not billing:
            pytest.skip("Billing dept not found")
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_wrongdept", "description": "x",
            "priority": "medium", "department": billing["id"]
        })
        tid = r.json()["id"]
        # Agent in Technical - should be forbidden
        r2 = agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        # Could be 403 or 404 (queryset excludes based on dept)
        assert r2.status_code in (403, 404), f"Expected 403/404, got {r2.status_code} {r2.text}"

    def test_escalate(self, admin_session, technical_dept_id):
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_esc", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        tid = r.json()["id"]
        # No reason -> 400
        r2 = admin_session.post(f"{API}/tickets/{tid}/escalate/", json={})
        assert r2.status_code == 400
        r3 = admin_session.post(f"{API}/tickets/{tid}/escalate/", json={"reason": "urgent"})
        assert r3.status_code == 200, r3.text
        data = r3.json()
        assert data["priority"] == "medium"
        assert data["status"] == "escalated"

    def test_reopen(self, admin_session, agent_session, technical_dept_id):
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_reopen", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        tid = r.json()["id"]
        agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        agent_session.post(f"{API}/tickets/{tid}/resolve/")
        r2 = admin_session.post(f"{API}/tickets/{tid}/reopen/")
        assert r2.status_code == 200
        data = r2.json()
        assert data["status"] == "reopened"
        assert data["resolved_at"] is None


# ----------------- COMMENTS -----------------
class TestComments:
    def test_customer_cannot_see_internal(self, customer_session, admin_session, agent_session, technical_dept_id):
        # customer creates ticket
        r = customer_session.post(f"{API}/tickets/", json={
            "subject": "TEST_comments", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        assert r.status_code == 201
        tid = r.json()["id"]
        # admin posts internal + public
        r2 = admin_session.post(f"{API}/tickets/{tid}/comments/", json={
            "message": "internal note text", "comment_type": "internal"
        })
        assert r2.status_code == 201, r2.text
        r3 = admin_session.post(f"{API}/tickets/{tid}/comments/", json={
            "message": "public reply text", "comment_type": "public"
        })
        assert r3.status_code == 201
        # customer gets comments - only public
        cr = customer_session.get(f"{API}/tickets/{tid}/comments/")
        assert cr.status_code == 200
        clist = cr.json()
        assert all(c["comment_type"] == "public" for c in clist), clist
        assert len(clist) == 1
        # admin sees both
        ar = admin_session.get(f"{API}/tickets/{tid}/comments/")
        assert len(ar.json()) == 2

    def test_customer_cannot_post_internal(self, customer_session, technical_dept_id):
        r = customer_session.post(f"{API}/tickets/", json={
            "subject": "TEST_cint", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        tid = r.json()["id"]
        r2 = customer_session.post(f"{API}/tickets/{tid}/comments/", json={
            "message": "trying internal", "comment_type": "internal"
        })
        assert r2.status_code == 403


# ----------------- ATTACHMENTS -----------------
class TestAttachments:
    @pytest.fixture
    def ticket_id(self, customer_session, technical_dept_id):
        r = customer_session.post(f"{API}/tickets/", json={
            "subject": "TEST_att", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        return r.json()["id"]

    def test_unsupported_ext(self, customer_session, ticket_id):
        # send multipart w/o Content-Type json
        s = customer_session
        files = {"file": ("evil.exe", b"MZ...", "application/octet-stream")}
        # remove content-type header for multipart
        headers = {k: v for k, v in s.headers.items() if k.lower() != "content-type"}
        r = s.post(f"{API}/tickets/{ticket_id}/attachments/", files=files, headers=headers)
        assert r.status_code == 400, r.text

    def test_valid_png(self, customer_session, ticket_id):
        s = customer_session
        # 1x1 png header
        png_bytes = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626000000000050001a5f645400000000049454e44ae426082")
        files = {"file": ("test.png", png_bytes, "image/png")}
        headers = {k: v for k, v in s.headers.items() if k.lower() != "content-type"}
        r = s.post(f"{API}/tickets/{ticket_id}/attachments/", files=files, headers=headers)
        assert r.status_code == 201, r.text

    def test_empty_file(self, customer_session, ticket_id):
        s = customer_session
        files = {"file": ("empty.pdf", b"", "application/pdf")}
        headers = {k: v for k, v in s.headers.items() if k.lower() != "content-type"}
        r = s.post(f"{API}/tickets/{ticket_id}/attachments/", files=files, headers=headers)
        assert r.status_code == 400

    def test_traversal(self, customer_session, ticket_id):
        s = customer_session
        files = {"file": ("../evil.png", b"x", "image/png")}
        headers = {k: v for k, v in s.headers.items() if k.lower() != "content-type"}
        r = s.post(f"{API}/tickets/{ticket_id}/attachments/", files=files, headers=headers)
        assert r.status_code == 400


# ----------------- FEEDBACK -----------------
class TestFeedback:
    def test_feedback_flow(self, customer_session, agent_session, technical_dept_id):
        r = customer_session.post(f"{API}/tickets/", json={
            "subject": "TEST_fb", "description": "x",
            "priority": "low", "department": technical_dept_id
        })
        tid = r.json()["id"]
        # feedback on unresolved -> 400
        r_bad = customer_session.post(f"{API}/tickets/{tid}/feedback/", json={"rating": 5})
        assert r_bad.status_code == 400
        # agent resolves
        agent_session.post(f"{API}/tickets/{tid}/self-assign/")
        agent_session.post(f"{API}/tickets/{tid}/resolve/")
        # submit feedback
        r2 = customer_session.post(f"{API}/tickets/{tid}/feedback/", json={"rating": 4, "comment": "ok"})
        assert r2.status_code == 201, r2.text
        # duplicate
        r3 = customer_session.post(f"{API}/tickets/{tid}/feedback/", json={"rating": 5})
        assert r3.status_code == 400


# ----------------- AUDIT LOG -----------------
class TestAuditLog:
    def test_admin_can_list(self, admin_session):
        r = admin_session.get(f"{API}/audit-logs/")
        assert r.status_code == 200

    def test_customer_forbidden(self, customer_session):
        r = customer_session.get(f"{API}/audit-logs/")
        assert r.status_code == 403

    def test_readonly_no_patch(self, admin_session):
        r = admin_session.get(f"{API}/audit-logs/")
        data = r.json()
        if isinstance(data, dict) and "results" in data:
            data = data["results"]
        if data:
            aid = data[0]["id"]
            r2 = admin_session.patch(f"{API}/audit-logs/{aid}/", json={"action": "hack"})
            assert r2.status_code == 405
            r3 = admin_session.delete(f"{API}/audit-logs/{aid}/")
            assert r3.status_code == 405


# ----------------- NOTIFICATIONS -----------------
class TestNotifications:
    def test_list_and_unread(self, admin_session):
        r = admin_session.get(f"{API}/notifications/")
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/notifications/unread-count/")
        assert r2.status_code == 200
        assert "unread_count" in r2.json()

    def test_mark_all_read(self, admin_session):
        r = admin_session.post(f"{API}/notifications/mark-all-read/")
        assert r.status_code == 200


# ----------------- REPORTS -----------------
class TestReports:
    def test_dashboard(self, admin_session):
        r = admin_session.get(f"{API}/reports/dashboard/")
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "open", "resolved", "by_priority", "by_department"]:
            assert k in d

    def test_agent_performance(self, admin_session):
        r = admin_session.get(f"{API}/reports/agent-performance/")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_sla_summary(self, admin_session):
        r = admin_session.get(f"{API}/reports/sla-summary/")
        assert r.status_code == 200

    def test_ticket_trends(self, admin_session):
        r = admin_session.get(f"{API}/reports/ticket-trends/")
        assert r.status_code == 200

    def test_customer_forbidden(self, customer_session):
        r = customer_session.get(f"{API}/reports/dashboard/")
        assert r.status_code == 403


# ----------------- DEPARTMENTS -----------------
class TestDepartments:
    def test_delete_with_active_ticket_fails(self, admin_session, technical_dept_id):
        # There should be tickets in Technical dept from earlier tests
        r = admin_session.delete(f"{API}/departments/{technical_dept_id}/")
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ----------------- ADMIN ASSIGN -----------------
class TestAdminAssign:
    def test_admin_assign_wrong_dept_rejected(self, admin_session, agent_session, technical_dept_id):
        # find billing dept + create ticket
        r = admin_session.get(f"{API}/departments/")
        depts = r.json()
        if isinstance(depts, dict) and "results" in depts:
            depts = depts["results"]
        billing = next((d for d in depts if d["name"] == "Billing"), None)
        if not billing:
            pytest.skip("Billing not found")
        r = admin_session.post(f"{API}/tickets/", json={
            "subject": "TEST_admassign", "description": "x",
            "priority": "low", "department": billing["id"]
        })
        tid = r.json()["id"]
        # find agent id (agent is in Technical)
        me = agent_session.get(f"{API}/auth/me/").json()
        agent_id = me["id"]
        r2 = admin_session.post(f"{API}/tickets/{tid}/assign/", json={"agent_id": agent_id})
        assert r2.status_code == 400, r2.text
