import ProfileHeader from "@/components/ProfileHeader";
import SocialLinks from "@/components/SocialLinks";
import BookingSection from "@/components/BookingSection";
import ServicesSection from "@/components/ServicesSection";
import AiChatAgent from "@/components/AiChatAgent";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Horizontal scrolling container on mobile, grid on desktop */}
      <div className="flex flex-row overflow-x-auto snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-3 lg:overflow-visible lg:min-h-screen">
        
        {/* Panel 1: Profile & Social */}
        <section className="min-w-[100vw] snap-center flex flex-col justify-center px-2 py-6 lg:min-w-0 lg:border-r lg:border-border/30">
          <div className="max-w-md mx-auto w-full">
            <ProfileHeader />
            <SocialLinks />
            <BookingSection />
          </div>
        </section>

        {/* Panel 2: Services */}
        <section className="min-w-[100vw] snap-center flex flex-col justify-center px-2 py-6 lg:min-w-0 lg:border-r lg:border-border/30">
          <div className="max-w-md mx-auto w-full">
            <ServicesSection />
          </div>
        </section>

        {/* Panel 3: AI Chat - fully integrated */}
        <section className="min-w-[100vw] snap-center flex flex-col h-screen lg:min-w-0 lg:h-auto lg:min-h-screen">
          <AiChatAgent />
        </section>
      </div>

      {/* Swipe indicator on mobile */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 lg:hidden z-40 pointer-events-none">
        <SwipeDots />
      </div>
    </div>
  );
};

const SwipeDots = () => {
  return (
    <div className="flex gap-1.5 bg-card/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-border/30">
      <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Swipe</span>
      <span className="text-[10px] text-primary">→</span>
    </div>
  );
};

export default Index;
