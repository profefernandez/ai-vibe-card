import { useRef } from "react";
import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import AiChatBar, { type AiChatBarHandle } from "./AiChatBar";
import { Calendar, Sparkles } from "lucide-react";

const HeroSection = () => {
  const chatBarRef = useRef<AiChatBarHandle>(null);

  const handleAskWatts = () => {
    chatBarRef.current?.focusInput();
  };

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col"
      >
        {/* Content area */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          {/* Brand name */}
          <motion.h1
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl font-display font-black text-gradient-amber tracking-tight text-center mb-6"
          >
            60 Watts of Clarity
          </motion.h1>

          {/* Photo */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.7, type: "spring", stiffness: 150 }}
            className="w-28 h-28 rounded-full overflow-hidden glow-amber mb-5 border-2 border-primary/30"
          >
            <img
              src={profilePhoto}
              alt="Tanya Williams - Founder of 60 Watts of Clarity"
              className="w-full h-full object-cover"
            />
          </motion.div>

          {/* Name & info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-center"
          >
            <p className="text-lg font-display font-semibold text-foreground">Tanya Williams</p>
            <p className="text-xs text-muted-foreground mt-1">Founder & AI Consultant</p>
            <p className="text-sm text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed">
              No-code AI agent training for social work professionals.
              <br />
              Grounded in the NASW Code of Ethics.
            </p>
          </motion.div>

          {/* Social icons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-5"
          >
            <SocialLinks />
          </motion.div>

          {/* Dual CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex gap-3 mt-6"
          >
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm glow-amber hover:scale-105 active:scale-95 transition-transform"
            >
              <Calendar className="w-4 h-4" />
              Book a Call
            </a>
            <button
              onClick={handleAskWatts}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Ask Watts
            </button>
          </motion.div>
        </div>

        {/* Chat input bar inside the card */}
        <AiChatBar ref={chatBarRef} inline />
      </motion.div>
    </section>
  );
};

export default HeroSection;
