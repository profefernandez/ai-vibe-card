import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient as db } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a verification link." });
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/admin");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-dark flex items-center justify-center px-4" aria-label="Authentication">
      <div className="w-full max-w-sm space-y-6">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1" aria-label="Back to home page">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
        </button>

        <div>
          <h1 className="text-2xl font-bold text-foreground">{isSignUp ? "Create Account" : "Sign In"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp ? "Sign up to manage your site content" : "Access your admin dashboard"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="auth-email" className="sr-only">Email</label>
            <Input
              id="auth-email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-secondary/60 border-border/30"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="auth-password" className="sr-only">Password</label>
            <Input
              id="auth-password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="bg-secondary/60 border-border/30"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </main>
  );
};

export default Auth;
