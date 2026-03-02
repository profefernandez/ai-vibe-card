import ProfileHeader from "@/components/ProfileHeader";
import SocialLinks from "@/components/SocialLinks";
import LinkCategories from "@/components/LinkCategories";
import ServicesSection from "@/components/ServicesSection";
import AiChatBubble from "@/components/AiChatBubble";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-dark flex justify-center">
      <div className="w-full max-w-md mx-auto px-4 py-6 space-y-6">
        <ProfileHeader />
        <SocialLinks />
        <LinkCategories />
        <ServicesSection />

        <p className="text-center text-[10px] text-muted-foreground/40 pb-20">
          © 2026 60 Watts of Clarity
        </p>
      </div>

      {/* Floating AI Chat */}
      <AiChatBubble />
    </div>
  );
};

export default Index;
