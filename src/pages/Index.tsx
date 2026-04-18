import HeroSection from "@/components/HeroSection";
import { Link } from "react-router-dom";

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LoginIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark relative">
      {/* Owner controls — fixed top-right, subtle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 backdrop-blur-sm border border-border/30 px-3.5 py-1.5 text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors shadow-sm"
          aria-label="Admin panel"
        >
          <SettingsIcon />
          Admin
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 backdrop-blur-sm border border-border/30 px-3.5 py-1.5 text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors shadow-sm"
          aria-label="Owner login"
        >
          <LoginIcon />
          Login
        </Link>
      </div>

      {/* ── Card section ── */}
      <HeroSection />
    </div>
  );
};

export default Index;
