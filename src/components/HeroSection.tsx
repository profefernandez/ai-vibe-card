import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import ExplorePanel from "./ExplorePanel";
import { Calendar, Sparkles, Search, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string;
  calendly_url: string;
}

const HeroSection = () => {
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Fetch the first profile (site owner)
    supabase
      .from("profiles")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            display_name: data.display_name || "",
            tagline: data.tagline || "",
            bio: data.bio || "",
            avatar_url: data.avatar_url || "",
            calendly_url: data.calendly_url || "",
          });
        }
      });
  }, []);

  // Derived values with fallbacks
  const displayName = profile?.display_name || "Tanya Williams";
  const tagline = profile?.tagline || "Founder & AI Consultant";
  const bio = profile?.bio || "No-code AI agent training for social work professionals.\nGrounded in the NASW Code of Ethics.";
  const avatarUrl = profile?.avatar_url || profilePhoto;
  const calendlyUrl = profile?.calendly_url || "https://calendly.com";

  // Drag-based slider
  const dragX = useMotionValue(0);
  const DRAG_THRESHOLD = -80;

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < DRAG_THRESHOLD) {
      setIsExploreOpen(true);
    } else if (info.offset.x > -DRAG_THRESHOLD) {
      setIsExploreOpen(false);
    }
    dragX.set(0);
  };

  const openExplore = useCallback(() => setIsExploreOpen(true), []);
  const closeExplore = useCallback(() => setIsExploreOpen(false), []);

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4">
      <motion.div
        layout
        transition={{ type: "spring", damping: 32, stiffness: 220 }}
        className={`relative w-full rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden ${
          isExploreOpen ? "max-w-5xl" : "max-w-lg"
        }`}
        style={{ minHeight: isExploreOpen ? "80vh" : "auto" }}
      >
        <div className={`flex h-full ${isExploreOpen ? "flex-row" : "flex-col"}`}>
          {/* ── Business Card Side ── */}
          <motion.div
            layout
            drag={!isExploreOpen ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{ x: !isExploreOpen ? dragX : 0 }}
            className={`flex flex-col items-center cursor-grab active:cursor-grabbing ${
              isExploreOpen
                ? "w-80 flex-shrink-0 border-r border-border/30 px-6 py-8"
                : "px-8 pt-12 pb-10 w-full"
            }`}
          >
            {/* Brand name */}
            <motion.h1
              layout="position"
              className={`font-display font-black text-gradient-amber tracking-tight text-center ${
                isExploreOpen ? "text-xl mb-4" : "text-5xl mb-8"
              } transition-[font-size] duration-300`}
            >
              60 Watts of Clarity
            </motion.h1>

            {/* Photo */}
            <motion.div
              layout="position"
              className={`rounded-full overflow-hidden glow-amber border-2 border-primary/30 ${
                isExploreOpen ? "w-20 h-20 mb-3" : "w-32 h-32 mb-6"
              } transition-all duration-300`}
            >
              <img
                src={avatarUrl}
                alt={`${displayName} - ${tagline}`}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
              />
            </motion.div>

            {/* Name & info */}
            <div className="text-center">
              <p className={`font-display font-semibold text-foreground ${isExploreOpen ? "text-base" : "text-xl"}`}>
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{tagline}</p>
              <p className={`text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed ${isExploreOpen ? "text-xs" : "text-sm"}`}>
                {bio.split("\n").map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < bio.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </p>
            </div>

            {/* Social icons */}
            <div className={isExploreOpen ? "mt-4" : "mt-6"}>
              <SocialLinks />
            </div>

            {/* CTAs */}
            <div className={`flex gap-3 ${isExploreOpen ? "mt-4 flex-col w-full" : "mt-8"}`}>
              <a
                href={calendlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm glow-amber hover:scale-105 active:scale-95 transition-transform"
              >
                <Calendar className="w-4 h-4" />
                Book a Call
              </a>
              <button
                onClick={openExplore}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-secondary border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all"
              >
                <Search className="w-4 h-4" />
                Explore
              </button>
            </div>

            {/* Swipe hint when card is in default mode */}
            {!isExploreOpen && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-6 text-[10px] text-muted-foreground/40 flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3 animate-pulse" />
                Swipe or tap Explore
              </motion.p>
            )}
          </motion.div>

          {/* ── Explore Panel ── */}
          <AnimatePresence>
            {isExploreOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "100%" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 220 }}
                className="flex-1 min-w-0 relative"
              >
                {/* Back / close */}
                <button
                  onClick={closeExplore}
                  className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close explore"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <ExplorePanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
