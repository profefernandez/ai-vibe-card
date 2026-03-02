import ProfileHeader from "@/components/ProfileHeader";
import LinkButtons from "@/components/LinkButtons";
import ServicesSection from "@/components/ServicesSection";
import AiChatAgent from "@/components/AiChatAgent";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark flex justify-center">
      <div className="w-full max-w-md mx-auto px-4 py-8 space-y-6">
        <ProfileHeader />
        <LinkButtons />
        <ServicesSection />
        
        {/* Divider */}
        <div className="flex items-center gap-3 px-2">
          <div className="flex-1 h-px bg-border/50" />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-xs text-muted-foreground uppercase tracking-widest"
          >
            Ask Watts AI
          </motion.span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {/* Inline AI Chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          className="rounded-3xl border border-border/50 overflow-hidden bg-gradient-card"
          style={{ minHeight: 420 }}
        >
          <AiChatAgent />
        </motion.div>

        <p className="text-center text-[10px] text-muted-foreground/40 pb-4">
          © 2026 60 Watts of Clarity
        </p>
      </div>
    </div>
  );
};

export default Index;
