import { useState, useRef } from "react";
import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import AiChatBar, { type AiChatBarHandle } from "./AiChatBar";
import AiChatAgent from "./AiChatAgent";
import { Calendar, Sparkles } from "lucide-react";
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

  const chatContent = (
    <div className="flex flex-col h-full">
      <AiChatAgent
        initialMessage={pendingMessage}
        onMessageConsumed={() => setPendingMessage(null)}
      />
    </div>
  );

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      {/* Business Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-2xl lg:max-w-3xl rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-2 w-full bg-gradient-to-r from-primary via-accent to-primary" />

        {/* Card content — single column, centered */}
        <div className="flex flex-col items-center px-8 sm:px-12 lg:px-16 pt-10 sm:pt-14 lg:pt-16 pb-8 sm:pb-10">
          {/* Brand name */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="font-display font-black text-gradient-amber tracking-tight text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-tight"
          >
            60 Watts of Clarity
          </motion.h1>

          <p className="text-muted-foreground mt-3 sm:mt-4 text-base sm:text-lg lg:text-xl text-center max-w-lg leading-relaxed">
            No-code AI agent training for social work professionals.
            <br className="hidden sm:block" />
            Grounded in the NASW Code of Ethics.
          </p>

          {/* Divider */}
          <div className="w-24 h-px bg-primary/40 my-8 sm:my-10" />

          {/* Photo */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
            className="w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40 rounded-full overflow-hidden glow-amber border-2 border-primary/30"
          >
            <img
              src={profilePhoto}
              alt="Tanya Williams - Founder of 60 Watts of Clarity"
              className="w-full h-full object-cover"
            />
          </motion.div>

          {/* Name & title */}
          <h2 className="font-display font-bold text-foreground text-2xl sm:text-3xl lg:text-4xl mt-5 sm:mt-6 text-center">
            Tanya Williams
          </h2>
          <p className="text-primary font-semibold text-base sm:text-lg mt-1 tracking-wide">
            Founder &amp; AI Consultant
          </p>

          {/* Social links */}
          <div className="mt-5 sm:mt-6">
            <SocialLinks />
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-8 sm:mt-10 w-full sm:w-auto">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-3.5 sm:py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base sm:text-lg glow-amber hover:scale-105 active:scale-95 transition-transform"
            >
              <Calendar className="w-5 h-5" />
              Book a Call
            </a>
            <button
              onClick={handleAskWatts}
              className="flex items-center justify-center gap-2 px-8 py-3.5 sm:py-4 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-base sm:text-lg hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Ask Watts
            </button>
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
