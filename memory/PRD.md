# Helpdesk Ticketing & SLA Management System

**Stack**: Django REST Framework + SQLite (PostgreSQL-ready) + APScheduler + SSE + React 19 + Tailwind + shadcn/ui + Recharts + JWT (HTTP-only cookies)

## Problem Statement
Full stack Helpdesk system with Customer / Support Agent / Admin roles, complete ticket lifecycle, SLA management with warnings & breach detection, background jobs, real-time notifications via SSE, escalation, audit logs, and object-level permissions.

## Architecture
- **Backend**: Django 5 + DRF, ASGI via uvicorn. Cookie-based JWT auth using `djangorestframework-simplejwt` with token rotation.
- **Real-time**: Server-Sent Events (SSE) at `/api/events/notifications/` (per-user stream, polling DB every 3s).
- **Background jobs**: APScheduler runs in-process. `check_sla` (every 1 min) and `auto_close` (every 30 min).
- **DB**: SQLite (portable, zero-config). `.env.example` shows `DATABASE_URL` for PostgreSQL swap.
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn/ui + Recharts.

## Personas
- **Customer**: Creates own tickets, replies publicly, uploads attachments, reopens/closes their tickets, rates support.
- **Support Agent**: Views assigned + department queue, self-assigns (concurrency-safe), updates status/priority, internal notes, escalates, resolves.
- **Admin**: Full control - manages users/departments/SLA rules, assigns/reassigns, views reports & audit logs.

## Core Requirements — Status

### Implemented (Iteration 1)
- ✅ **Auth**: Register / Login / Logout / Me / Refresh (rotation) / Change / Forgot / Reset password. JWT in HTTP-only Secure SameSite=None cookies. Brute-force lockout (5 attempts → 15 min lock).
- ✅ **Roles & permissions**: Object-level (owner / department / assigned) + role-based (Admin only for destructive/config actions).
- ✅ **Ticket model**: Ticket number `TKT-YYYY-######` (immutable), all required fields including SLA snapshot.
- ✅ **Ticket lifecycle**: 8 statuses with validated state transitions enforced by backend.
- ✅ **Assignment**: Admin assign, agent self-assign with `select_for_update` → HTTP 409 on concurrent conflict, agent-department constraint, reassignment history.
- ✅ **SLA**: Rules per priority, snapshot at creation, background job flags warnings (< 20% remaining) + breaches (idempotent via flags & dedupe key).
- ✅ **Comments**: Public + Internal (customers can only post public, can only see public).
- ✅ **Attachments**: Extension + MIME + size + empty file + filename safety validation. 10 MB cap.
- ✅ **Escalation**: Reason required, priority incremented, escalation history preserved, admin notified.
- ✅ **Feedback**: 1-5 rating, one per ticket, only resolved/closed, only by owner.
- ✅ **Audit log**: Immutable via API (read-only viewset), records old/new value + IP.
- ✅ **Notifications**: In-app list + unread count + mark one/all read + SSE stream + dedupe key idempotency.
- ✅ **Background jobs**: SLA scan (idempotent flags), auto-close resolved after 72h.
- ✅ **Search/filter/sort/paginate**: DRF filter backends + custom SLA-breach filter.
- ✅ **Reports**: dashboard, agent-performance, sla-summary, ticket-trends.
- ✅ **Frontend pages**: All 3 role dashboards, ticket CRUD flows, feedback modal, SLA countdown timer, notification bell.

### Backlog / Not yet done (bonus / future)
- P1: Docker Compose (Nginx + Postgres + Redis + Celery + Beat) - present as .env template but not wired
- P1: Automated pytest test suite (some scaffolding via `pytest.ini` present)
- P2: Business-hours SLA, holidays, CSV/PDF export, ticket merge, saved filters, dark mode toggle, Sentry, Swagger UI, CI/CD

## Files & Key Modules
- Backend: `/app/backend/helpdesk/settings.py`, `/app/backend/core/{models,views,serializers,urls,auth,permissions,jobs,sse,bootstrap,middleware,utils}.py`
- Frontend: `/app/frontend/src/{App.js,index.css,lib/{api.js,auth.jsx,tickets.js},components/{AppLayout.jsx,Badges.jsx,SLATimer.jsx},pages/*}`

## Test Credentials
See `/app/memory/test_credentials.md`.

## Next Actions
1. Backend & frontend regression via testing subagent
2. Address any critical issues from tests
3. Layer bonus features (Docker, exports, dark mode) on user request
