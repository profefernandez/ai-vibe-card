import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

const ProfileHeader = () => {
  const handleShare = async () => {
    const shareData = {
      title: "60 Watts of Clarity - AI Consulting",
      text: "Check out 60 Watts of Clarity - No-code AI agent training for social work professionals.",
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center pt-4 pb-2 relative"
    >
      <button
        onClick={handleShare}
        className="absolute top-2 right-0 p-2.5 rounded-full bg-secondary text-muted-foreground hover:text-primary transition-colors"
        aria-label="Share this card"
      >
        <Share2 className="w-5 h-5" />
      </button>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="w-28 h-28 rounded-full overflow-hidden glow-amber animate-pulse-glow mb-4 border-2 border-primary/30"
      >
        <img
          src={profilePhoto}
          alt="Tanya Williams - Founder of 60 Watts of Clarity"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <h1 className="text-3xl font-display font-black text-gradient-amber tracking-tight">
        Tanya Williams
      </h1>
      <p className="text-sm text-muted-foreground mt-1.5 tracking-widest uppercase font-medium">
        Founder & AI Consultant
      </p>
      <p className="text-primary font-display text-xl mt-2 font-bold">
        60 Watts of Clarity
      </p>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs leading-relaxed">
        No-code AI agent training for social work professionals. Grounded in the NASW Code of Ethics.
      </p>
    </motion.section>
  );
};

export default ProfileHeader;
