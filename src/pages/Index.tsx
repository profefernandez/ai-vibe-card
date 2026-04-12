import HeroSection from "@/components/HeroSection";
import { Link } from "react-router-dom";
import { LogIn, Settings } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark relative">
      {/* Owner login — fixed top-right */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border/30 px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors shadow-md"
          aria-label="Admin panel"
        >
          <Settings className="w-4 h-4" />
          Admin
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border/30 px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors shadow-md"
          aria-label="Owner login"
        >
          <LogIn className="w-4 h-4" />
          Login
        </Link>
      </div>

      <HeroSection />
    </div>
  );
};

export default Index;
