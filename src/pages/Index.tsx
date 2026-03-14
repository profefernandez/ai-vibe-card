import { useRef } from "react";
import HeroSection from "@/components/HeroSection";
import AiChatBar, { type AiChatBarHandle } from "@/components/AiChatBar";

const Index = () => {
  const chatBarRef = useRef<AiChatBarHandle>(null);

  const handleAskWatts = () => {
    chatBarRef.current?.focusInput();
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <div className="max-w-md mx-auto">
        <HeroSection onAskWatts={handleAskWatts} />
      </div>
      <AiChatBar ref={chatBarRef} />
    </div>
  );
};

export default Index;
