import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import { Share2, ChevronDown, Calendar, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface HeroSectionProps {
  onAskWatts: () => void;
}

const HeroSection = ({ onAskWatts }: HeroSectionProps) => {
  const handleShare = async () => {
    const shareData = {
      title: "60 Watts of Clarity - AI Consulting",
      text: "No-code AI agent training for social work professionals.",
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied!");
    }
  };

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-6 pb-16">
      {/* Share button */}
      <motion.button
        onClick={handleShare}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute top-6 right-6 p-2.5 rounded-full bg-secondary/60 text-muted-foreground hover:text-primary transition-colors backdrop-blur-sm"
        aria-label="Share"
      >
        <Share2 className="w-4 h-4" />
      </motion.button>

      {/* Photo */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 150 }}
        className="w-32 h-32 rounded-full overflow-hidden glow-amber mb-6 border-2 border-primary/30"
      >
        <img
          src={profilePhoto}
          alt="Tanya Williams - Founder of 60 Watts of Clarity"
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Name & tagline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-center"
      >
        <h1 className="text-4xl font-display font-black text-gradient-amber tracking-tight">
          60 Watts of Clarity
        </h1>
        <p className="text-lg text-foreground/80 mt-3 font-display font-semibold">
          AI for Social Work —{" "}
          <span className="text-primary">Ethically Built</span>
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">
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
        transition={{ delay: 0.7, duration: 0.5 }}
        className="flex gap-3 mt-8"
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
          onClick={onAskWatts}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Ask Watts
        </button>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-1 text-muted-foreground/40"
        >
          <span className="text-[10px] uppercase tracking-widest">Explore</span>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
