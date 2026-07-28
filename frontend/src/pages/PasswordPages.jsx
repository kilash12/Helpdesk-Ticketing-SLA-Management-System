import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import client, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    try {
      const { data } = await client.post("/auth/forgot-password/", { email });
      setMsg(data.detail || "Check your inbox (or backend console for mock email).");
    } catch (e) { setErr(formatApiError(e.response?.data)); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Forgot password</CardTitle>
          <CardDescription>We'll send a reset link. In this demo, the link is printed in the backend console.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" />
            </div>
            {msg && <Alert><AlertDescription data-testid="forgot-success">{msg}</AlertDescription></Alert>}
            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            <Button type="submit" className="w-full" data-testid="forgot-submit-btn">Send reset link</Button>
            <div className="text-sm text-center"><Link to="/login" className="text-muted-foreground">Back to sign in</Link></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    try {
      const { data } = await client.post("/auth/reset-password/", { token, new_password: password });
      setMsg(data.detail || "Password reset. You can now sign in.");
      setTimeout(() => nav("/login"), 1500);
    } catch (e) { setErr(formatApiError(e.response?.data)); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Reset password</CardTitle>
          <CardDescription>Paste the token from your reset email and choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label>Reset token</Label>
              <Input required value={token} onChange={(e) => setToken(e.target.value)} data-testid="reset-token-input" /></div>
            <div className="space-y-1.5"><Label>New password</Label>
              <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password-input" /></div>
            {msg && <Alert><AlertDescription data-testid="reset-success">{msg}</AlertDescription></Alert>}
            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            <Button type="submit" className="w-full" data-testid="reset-submit-btn">Reset password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
