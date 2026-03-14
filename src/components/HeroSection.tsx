import { motion } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import { Calendar, Sparkles } from "lucide-react";

interface HeroSectionProps {
  onAskWatts: () => void;
}

const HeroSection = ({ onAskWatts }: HeroSectionProps) => {
  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
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

      {/* Name */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-4xl font-display font-black text-gradient-amber tracking-tight text-center"
      >
        60 Watts of Clarity
      </motion.h1>

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
        transition={{ delay: 0.6, duration: 0.5 }}
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
    </section>
  );
};

export default HeroSection;
