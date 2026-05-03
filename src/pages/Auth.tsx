import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { auth as supabaseAuth } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

type AuthMode = "signin" | "signup" | "forgot" | "reset";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    // Two cases land us in "set new password" mode:
    //   1. Legacy reset link with `?reset=<token>` (still supported during
    //      the migration; ignored — Supabase doesn't use this token).
    //   2. Supabase password-recovery deep link, which arrives as
    //      `#access_token=…&type=recovery` and is auto-consumed by
    //      supabase-js when `detectSessionInUrl` is enabled. After that the
    //      user has a temporary session and we just need to show the form.
    const resetToken = searchParams.get("reset");
    const hash = window.location.hash;
    if (resetToken || hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, [searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error, autoLoggedIn } = await signUp(email, password);
        if (error) throw error;
        if (autoLoggedIn) {
          toast({ title: "Welcome", description: "Let's set up your card." });
          navigate("/admin");
        } else {
          toast({
            title: "Check your email",
            description: "Confirm your address to finish signing up.",
          });
          setMode("signin");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate("/admin");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabaseAuth.resetPasswordForEmail(email, {
        // Supabase appends `#access_token=…&type=recovery` to this URL.
        redirectTo: `${window.location.origin}/auth?reset=1`,
      });
      // Always show the same confirmation regardless of whether the email
      // exists — keeps user enumeration off the table, matching the
      // legacy Express endpoint's behaviour.
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.updatePassword(newPassword);
      if (error) throw error;
      toast({ title: "Password updated", description: "Please sign in with your new password." });
      navigate("/auth");
      setMode("signin");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Reset failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const renderTitle = () => {
    if (mode === "forgot") return forgotSent ? "Check your email" : "Forgot password";
    if (mode === "reset") return "Set new password";
    return mode === "signup" ? "Create Account" : "Sign In";
  };

  const renderSubtitle = () => {
    if (mode === "forgot" && forgotSent) return "If that email is registered, a reset link is on its way.";
    if (mode === "forgot") return "Enter your email and we'll send a reset link.";
    if (mode === "reset") return "Enter a new password for your account.";
    return mode === "signup" ? "Sign up to manage your AI card" : "Access your admin dashboard";
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4" aria-label="Authentication">
      <div className="w-full max-w-sm space-y-6">
        <button
          onClick={() => (mode === "forgot" || mode === "reset") ? setMode("signin") : navigate("/")}
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          aria-label={(mode === "forgot" || mode === "reset") ? "Back to sign in" : "Back to home page"}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {(mode === "forgot" || mode === "reset") ? "Back to sign in" : "Back"}
        </button>

        <div>
          <h1 className="text-2xl font-bold text-foreground">{renderTitle()}</h1>
          <p className="text-sm text-muted-foreground mt-1">{renderSubtitle()}</p>
        </div>

        {(mode === "signin" || mode === "signup") && (
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="auth-email" className="sr-only">Email</label>
              <Input id="auth-email" type="email" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className="bg-secondary/60 border-border/30" />
            </div>
            <div className="space-y-1">
              <label htmlFor="auth-password" className="sr-only">Password</label>
              <Input id="auth-password" type="password" placeholder="Password" value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="bg-secondary/60 border-border/30" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Loading..." : mode === "signup" ? "Sign Up" : "Sign In"}
            </Button>
            {mode === "signin" && (
              <button type="button" onClick={() => setMode("forgot")}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors">
                Forgot your password?
              </button>
            )}
          </form>
        )}

        {mode === "forgot" && !forgotSent && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="forgot-email" className="sr-only">Email</label>
              <Input id="forgot-email" type="email" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className="bg-secondary/60 border-border/30" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-password" className="sr-only">New password</label>
              <Input id="new-password" type="password" placeholder="New password (min 8 chars)"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                required minLength={8} autoComplete="new-password"
                className="bg-secondary/60 border-border/30" />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="sr-only">Confirm new password</label>
              <Input id="confirm-password" type="password" placeholder="Confirm new password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                required minLength={8} autoComplete="new-password"
                className="bg-secondary/60 border-border/30" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Updating..." : "Set new password"}
            </Button>
          </form>
        )}

        {(mode === "signin" || mode === "signup") && (
          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
              {mode === "signup" ? "Sign In" : "Sign Up"}
            </button>
          </p>
        )}
      </div>
    </main>
  );
};

export default Auth;
