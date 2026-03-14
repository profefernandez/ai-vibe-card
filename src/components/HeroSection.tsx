import { useState, useRef } from "react";
import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import AiChatBar, { type AiChatBarHandle } from "./AiChatBar";
import AiChatAgent from "./AiChatAgent";
import { Calendar, Sparkles, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const HeroSection = () => {
  const chatBarRef = useRef<AiChatBarHandle>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();

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

  const chatContent = (
    <div className="flex flex-col h-full">
      <AiChatAgent
        initialMessage={pendingMessage}
        onMessageConsumed={() => setPendingMessage(null)}
      />
    </div>
  );

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-3 sm:px-6">
      {/* Business Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-2 w-full bg-gradient-to-r from-primary via-accent to-primary" />

        {/* Card content — horizontal on md+, stacked on mobile */}
        <div className="flex flex-col md:flex-row">
          {/* Left: Photo + identity */}
          <div className="flex flex-col items-center md:items-start md:border-r md:border-border/30 px-6 sm:px-8 md:px-10 pt-8 pb-6 md:py-10 md:w-[45%]">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
              className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 rounded-full overflow-hidden glow-amber border-2 border-primary/30 mb-4 md:mb-6"
            >
              <img
                src={profilePhoto}
                alt="Tanya Williams - Founder of 60 Watts of Clarity"
                className="w-full h-full object-cover"
              />
            </motion.div>

            <h2 className="font-display font-bold text-foreground text-xl sm:text-2xl md:text-3xl lg:text-4xl text-center md:text-left">
              Tanya Williams
            </h2>
            <p className="text-sm sm:text-base text-primary font-semibold mt-1 tracking-wide">
              Founder &amp; AI Consultant
            </p>

            <div className="mt-4 md:mt-6">
              <SocialLinks />
            </div>
          </div>

          {/* Right: Brand + mission + CTAs */}
          <div className="flex flex-col items-center md:items-start justify-center px-6 sm:px-8 md:px-10 pb-8 md:py-10 md:w-[55%]">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="font-display font-black text-gradient-amber tracking-tight text-center md:text-left text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight"
            >
              60 Watts
              <br />
              of Clarity
            </motion.h1>

            <p className="text-muted-foreground mt-4 md:mt-6 max-w-sm leading-relaxed text-sm sm:text-base md:text-lg text-center md:text-left">
              No-code AI agent training for social work professionals.
              <br className="hidden sm:block" />
              Grounded in the NASW Code of Ethics.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 md:mt-8 w-full sm:w-auto">
              <a
                href="https://calendly.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm sm:text-base glow-amber hover:scale-105 active:scale-95 transition-transform"
              >
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                Book a Call
              </a>
              <button
                onClick={handleAskWatts}
                className="flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-sm sm:text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                Ask Watts
              </button>
            </div>
          </div>
        </div>

        {/* Inline chat bar at the bottom */}
        <AiChatBar ref={chatBarRef} inline onSubmit={handleChatSubmit} />

        {/* Bottom accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-primary/20 via-primary/60 to-primary/20" />
      </motion.div>

      {/* Chat panel — Drawer on mobile, Sheet on desktop */}
      {isMobile ? (
        <Drawer open={isChatOpen} onOpenChange={setIsChatOpen}>
          <DrawerContent className="h-[85vh] bg-card border-border/50">
            <DrawerTitle className="sr-only">Ask Watts Chat</DrawerTitle>
            <DrawerDescription className="sr-only">Chat with the AI assistant</DrawerDescription>
            {chatContent}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
          <SheetContent
            side="right"
            className="w-[480px] sm:max-w-[480px] bg-card border-border/50 p-0 flex flex-col"
          >
            <SheetTitle className="sr-only">Ask Watts Chat</SheetTitle>
            <SheetDescription className="sr-only">Chat with the AI assistant</SheetDescription>
            {chatContent}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
};

export default HeroSection;
