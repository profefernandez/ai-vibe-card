import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import ValueProps from "@/components/ValueProps";
import AiChatAgent from "@/components/AiChatAgent";
import { Link } from "react-router-dom";
import { useState, useCallback } from "react";

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
  const [chatQuestion, setChatQuestion] = useState<string | null>(null);

  const handleAskAbout = useCallback((question: string) => {
    setChatQuestion(question);
    // Scroll to the chat section
    setTimeout(() => {
      document.getElementById("ai-chat-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

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

      {/* ── Divider ── */}
      <div className="w-full max-w-lg mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
      </div>

      {/* ── Value props (what this card does) ── */}
      <ValueProps />

      {/* ── Divider ── */}
      <div className="w-full max-w-lg mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
      </div>

      {/* ── Services ── */}
      <ServicesSection onAskAbout={handleAskAbout} />

      {/* ── Divider ── */}
      <div className="w-full max-w-lg mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
      </div>

      {/* ── AI Chat section ── */}
      <section
        id="ai-chat-section"
        className="px-4 py-14 flex flex-col items-center"
        aria-label="Ask the AI"
      >
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              Ask the AI
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Grounded in the NASW Code of Ethics. Trained on this practice context.
            </p>
          </div>
          <AiChatAgent
            siteId={null}
            initialMessage={chatQuestion}
            onMessageConsumed={() => setChatQuestion(null)}
          />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="text-center py-8 px-4 border-t border-border/20">
        <p className="text-xs text-muted-foreground/50">
          Powered by{" "}
          <span className="text-primary/70 font-medium">60 Watts of Clarity</span>
          {" "}· AI-assisted professional identity
        </p>
      </footer>
    </div>
  );
};

export default Index;
