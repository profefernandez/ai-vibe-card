import ProfileHeader from "@/components/ProfileHeader";
import SocialLinks from "@/components/SocialLinks";
import BookingSection from "@/components/BookingSection";
import ServicesSection from "@/components/ServicesSection";
import AiChatAgent from "@/components/AiChatAgent";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark flex justify-center">
      <div className="w-full max-w-md">
        <ProfileHeader />
        <SocialLinks />
        <BookingSection />
        <ServicesSection />

        <footer className="px-6 py-8 text-center">
          <p className="text-[10px] text-muted-foreground">
            © 2026 60 Watts of Clarity. All rights reserved.
          </p>
        </footer>
      </div>

      <AiChatAgent />
    </div>
  );
};

export default Index;
