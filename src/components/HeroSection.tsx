import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import ExplorePanel from "./ExplorePanel";
import { Calendar, Sparkles, Search, ChevronLeft } from "lucide-react";
import { apiClient as db } from "@/lib/apiClient";

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
    db
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
        className={`relative w-full rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden ${isExploreOpen ? "max-w-5xl" : "max-w-lg"
          }`}
        style={{ minHeight: isExploreOpen ? "80vh" : "auto" }}
      >
        {/* ── Decorative background graphics ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* Warm radial glow top-right */}
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
          {/* Accent circle bottom-left */}
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-amber-500/8 blur-2xl" />
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle, hsl(38 95% 50% / 0.4) 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          {/* Diagonal light streak */}
          <div className="absolute top-1/3 -left-20 w-[140%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent rotate-[-8deg]" />
        </div>

        <div className={`relative z-10 flex h-full ${isExploreOpen ? "flex-row" : "flex-col"}`}>
          {/* ── Business Card Side ── */}
          <motion.div
            layout
            drag={!isExploreOpen ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{ x: !isExploreOpen ? dragX : 0 }}
            className={`flex flex-col items-center cursor-grab active:cursor-grabbing ${isExploreOpen
              ? "w-80 flex-shrink-0 border-r border-border/30 px-6 py-8"
              : "px-8 pt-12 pb-10 w-full"
              }`}
          >
            {/* Brand name */}
            <motion.h1
              layout="position"
              className={`font-display font-black text-gradient-amber tracking-tight text-center ${isExploreOpen ? "text-xl mb-4" : "text-5xl mb-8"
                } transition-[font-size] duration-300`}
            >
              60 Watts of Clarity
            </motion.h1>

            {/* Photo */}
            <motion.div
              layout="position"
              className={`rounded-full overflow-hidden glow-amber border-2 border-primary/30 ${isExploreOpen ? "w-20 h-20 mb-3" : "w-32 h-32 mb-6"
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
              <p className={`font-sans font-semibold text-primary ${isExploreOpen ? "text-lg" : "text-4xl"}`}>
                {displayName}
              </p>
              <p className={`mt-2 font-sans text-amber-200 ${isExploreOpen ? "text-sm" : "text-base"}`}>{tagline}</p>
              <p className={`font-sans text-foreground/80 mt-4 max-w-sm mx-auto leading-relaxed ${isExploreOpen ? "text-sm" : "text-base"}`}>
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
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base glow-amber hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20 min-w-[150px]"
              >
                <Calendar className="w-4 h-4" />
                Book a Call
              </a>
              <button
                onClick={openExplore}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm min-w-[150px]"
              >
                <Search className="w-4 h-4" />
                Explore
              </button>
            </div>

            {/* Swipe hint when card is in default mode */}
            {!isExploreOpen && (
              <motion.button
                type="button"
                onClick={openExplore}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-6 text-base text-foreground inline-flex items-center gap-2 rounded-full bg-secondary/80 px-4 py-2 tracking-normal shadow-sm hover:bg-secondary/95 focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="Open explore panel. Swipe, tap, or press Enter on this button."
              >
                <ChevronLeft className="w-3 h-3 animate-pulse" />
                Swipe, tap, or press Enter to Explore
              </motion.button>
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

                <ExplorePanel onClose={closeExplore} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
