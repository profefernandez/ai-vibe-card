import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import AiChatBar, { type AiChatBarHandle } from "./AiChatBar";
import AiChatAgent from "./AiChatAgent";
import { Calendar, Sparkles, X } from "lucide-react";

const HeroSection = () => {
  const chatBarRef = useRef<AiChatBarHandle>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleAskWatts = () => {
    chatBarRef.current?.focusInput();
  };

  const handleChatSubmit = (message: string) => {
    setPendingMessage(message);
    setIsChatOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
    setPendingMessage(null);
  };

  const brandingContent = (
    <>
      {/* Brand name */}
      <motion.h1
        layout="position"
        className={`font-display font-black text-gradient-amber tracking-tight text-center ${
          isChatOpen ? "text-2xl mb-4" : "text-5xl mb-8"
        } transition-all duration-300`}
      >
        60 Watts of Clarity
      </motion.h1>

      {/* Photo */}
      <motion.div
        layout="position"
        className={`rounded-full overflow-hidden glow-amber border-2 border-primary/30 ${
          isChatOpen ? "w-20 h-20 mb-3" : "w-32 h-32 mb-6"
        } transition-all duration-300`}
      >
        <img
          src={profilePhoto}
          alt="Tanya Williams - Founder of 60 Watts of Clarity"
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Name & info */}
      <div className="text-center">
        <p className={`font-display font-semibold text-foreground ${isChatOpen ? "text-base" : "text-xl"}`}>
          Tanya Williams
        </p>
        <p className="text-xs text-muted-foreground mt-1">Founder & AI Consultant</p>
        <p className={`text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed ${isChatOpen ? "text-xs" : "text-sm"}`}>
          No-code AI agent training for social work professionals.
          <br />
          Grounded in the NASW Code of Ethics.
        </p>
      </div>

      {/* Social icons */}
      <div className={isChatOpen ? "mt-4" : "mt-6"}>
        <SocialLinks />
      </div>

      {/* Dual CTAs */}
      <div className={`flex gap-3 ${isChatOpen ? "mt-4 flex-col" : "mt-8"}`}>
        <a
          href="https://calendly.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm glow-amber hover:scale-105 active:scale-95 transition-transform"
        >
          <Calendar className="w-4 h-4" />
          Book a Call
        </a>
        <button
          onClick={handleAskWatts}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Ask Watts
        </button>
      </div>
    </>
  );

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4">
      <motion.div
        layout
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        className={`w-full rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden flex ${
          isChatOpen ? "max-w-4xl flex-row" : "max-w-lg flex-col"
        }`}
        style={{ minHeight: isChatOpen ? "80vh" : "auto" }}
      >
        {/* Business Card / Sidebar */}
        <motion.div
          layout
          className={`flex flex-col items-center ${
            isChatOpen
              ? "w-72 flex-shrink-0 border-r border-border/30 px-6 py-8 overflow-y-auto"
              : "px-8 pt-12 pb-10 w-full"
          }`}
        >
          {brandingContent}
        </motion.div>

        {/* Chat Panel */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "100%" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 200 }}
              className="flex-1 flex flex-col min-w-0 relative"
            >
              {/* Close button */}
              <button
                onClick={handleCloseChat}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>

              <AiChatAgent
                initialMessage={pendingMessage}
                onMessageConsumed={() => setPendingMessage(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline chat bar when collapsed */}
        {!isChatOpen && (
          <AiChatBar ref={chatBarRef} inline onSubmit={handleChatSubmit} />
        )}
      </motion.div>
    </section>
  );
};

export default HeroSection;
