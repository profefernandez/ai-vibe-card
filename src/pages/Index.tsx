import { useRef } from "react";
import HeroSection from "@/components/HeroSection";
import ValueProps from "@/components/ValueProps";
import ServicesSection from "@/components/ServicesSection";
import LinkCategories from "@/components/LinkCategories";
import AiChatBar, { type AiChatBarHandle } from "@/components/AiChatBar";
import SocialLinks from "@/components/SocialLinks";

const Index = () => {
  const chatBarRef = useRef<AiChatBarHandle>(null);

  const handleAskAbout = (question: string) => {
    chatBarRef.current?.sendMessage(question);
  };

  const handleAskWatts = () => {
    chatBarRef.current?.focusInput();
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <div className="max-w-md mx-auto">
        <HeroSection onAskWatts={handleAskWatts} />
        <ValueProps />
        <ServicesSection onAskAbout={handleAskAbout} />

        <div className="px-6 py-10">
          <LinkCategories />
        </div>

        {/* Footer */}
        <footer className="px-6 pb-24 pt-6 border-t border-border/20">
          <div className="flex justify-center mb-4">
            <SocialLinks />
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40">
            © 2026 60 Watts of Clarity
          </p>
        </footer>
      </div>

      <AiChatBar ref={chatBarRef} />
    </div>
  );
};

export default Index;
