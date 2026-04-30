import HeroSection from "@/components/card/HeroSection";
import { Link } from "react-router-dom";

/**
 * Public landing page — shows the card only.
 * Admin/Login links are hidden in the bottom-right corner so they don't
 * distract public visitors but remain accessible for the owner.
 */
const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark relative">
      {/* ── Card section ── */}
      <HeroSection />

      {/* Owner access — tucked bottom-right, nearly invisible until hovered */}
      <nav
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5"
        aria-label="Owner access"
      >
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground/20 hover:text-foreground/60 hover:bg-secondary/50 transition-colors"
          aria-label="Admin panel"
          tabIndex={0}
        >
          Admin
        </Link>
        <span className="text-foreground/10 text-xs" aria-hidden="true">·</span>
        <Link
          to="/auth"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground/20 hover:text-foreground/60 hover:bg-secondary/50 transition-colors"
          aria-label="Owner login"
          tabIndex={0}
        >
          Login
        </Link>
      </nav>
    </div>
  );
};

export default Index;
