import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-foreground text-background">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-background/60">HELPDESK — SLA CONSOLE</div>
          <h1 className="font-display text-4xl font-bold mt-4 leading-tight">Resolve every ticket. Beat every SLA.</h1>
        </div>
        <div className="space-y-4">
          <div className="border-t border-background/20 pt-4">
            <div className="font-mono text-xs uppercase text-background/60">Test Accounts</div>
            <div className="mt-2 space-y-1 text-sm font-mono">
              <div>admin@helpdesk.com / Admin@123</div>
              <div>agent@helpdesk.com / Agent@123</div>
              <div>customer@helpdesk.com / Customer@123</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the console.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password-input" />
              </div>
              {err && <Alert variant="destructive"><AlertDescription data-testid="login-error">{err}</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit-btn">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
              </Button>
              <div className="flex justify-between text-sm">
                <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground" data-testid="forgot-password-link">Forgot password?</Link>
                <Link to="/register" className="text-muted-foreground hover:text-foreground" data-testid="register-link">Create account</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
