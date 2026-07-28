import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import { ForgotPasswordPage, ResetPasswordPage } from "@/pages/PasswordPages";
import DashboardPage from "@/pages/DashboardPage";
import CreateTicketPage from "@/pages/CreateTicketPage";
import TicketListPage from "@/pages/TicketListPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import { DepartmentsPage, UsersPage, SLAConfigPage } from "@/pages/AdminPages";
import { ReportsPage, AuditLogsPage } from "@/pages/ReportsPages";

function Protected({ roles }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, checking } = useAuth();
  if (checking) return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            <Route element={<Protected />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/tickets" element={<TicketListPage />} />
                <Route path="/tickets/new" element={<CreateTicketPage />} />
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
              </Route>
            </Route>

            <Route element={<Protected roles={["admin"]} />}>
              <Route element={<AppLayout />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/sla" element={<SLAConfigPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/audit" element={<AuditLogsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
