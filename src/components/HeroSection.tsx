import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import type { SocialLink } from "./SocialLinks";
import ExplorePanel from "./ExplorePanel";
import { Search, ChevronLeft, Calendar, X } from "lucide-react";
import { apiClient as db } from "@/lib/apiClient";
import { applyTheme } from "@/lib/theme";

type CardLayout = "classic" | "bold";

/** Upsert a <meta> tag in <head> by name or property attribute. */
function setMetaTag(key: string, content: string, isProperty = false) {
  const attr = isProperty ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

interface Profile {
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string;
  cta_url: string;
  cta_label: string;
  cta_embed: string;
  social_links: SocialLink[];
  card_layout: CardLayout;
}

const HeroSection = () => {
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isCtaOpen, setIsCtaOpen] = useState(false);
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
            cta_url: data.cta_url || "",
            cta_label: data.cta_label || "Get in Touch",
            cta_embed: data.cta_embed || "",
            social_links: Array.isArray(data.social_links) ? data.social_links : [],
            card_layout: data.card_layout === "bold" ? "bold" : "classic",
          });

          // Apply theme + accent color from profile settings
          applyTheme(data.theme || "dark", data.accent_color || "amber");

          // Apply SEO / Open Graph meta tags dynamically
          if (data.seo_title) document.title = data.seo_title;
          if (data.seo_description) {
            setMetaTag("description", data.seo_description);
            setMetaTag("og:description", data.seo_description, true);
            setMetaTag("twitter:description", data.seo_description);
          }
          if (data.seo_title) {
            setMetaTag("og:title", data.seo_title, true);
          }
          if (data.og_image_url) {
            setMetaTag("og:image", data.og_image_url, true);
            setMetaTag("twitter:image", data.og_image_url);
          }
        }
      });
  }, []);

  // Derived values with fallbacks
  const displayName = profile?.display_name || "Tanya Williams";
  const tagline = profile?.tagline || "Founder & AI Consultant";
  const bio = profile?.bio || "No-code AI agent training for social work professionals.\nGrounded in the NASW Code of Ethics.";
  const avatarUrl = profile?.avatar_url || profilePhoto;
  const ctaUrl = profile?.cta_url || "#";
  const ctaLabel = profile?.cta_label || "Get in Touch";
  const ctaEmbed = profile?.cta_embed || "";
  const socialLinks = profile?.social_links || [];
  const cardLayout: CardLayout = profile?.card_layout || "classic";

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

  const openExplore = useCallback(() => { setIsCtaOpen(false); setIsExploreOpen(true); }, []);
  const closeExplore = useCallback(() => setIsExploreOpen(false), []);
  const openCta = useCallback(() => { setIsExploreOpen(false); setIsCtaOpen(true); }, []);
  const closeCta = useCallback(() => setIsCtaOpen(false), []);

  const isExpanded = isExploreOpen || isCtaOpen;

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4" aria-label="Business card">
      <motion.div
        layout
        transition={{ type: "spring", damping: 32, stiffness: 220 }}
        role="region"
        aria-label={`${displayName} — ${tagline}`}
        className={`relative w-full rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden ${isExpanded ? "max-w-5xl" : "max-w-lg"
          }`}
        style={{ minHeight: isExpanded ? "80vh" : "auto" }}
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

        <div className={`relative z-10 flex h-full ${isExpanded ? "flex-row" : "flex-col"}`}>
          {/* ── Business Card Side ── */}
          <motion.div
            layout
            drag={!isExpanded ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{ x: !isExpanded ? dragX : 0 }}
            className={`flex flex-col cursor-grab active:cursor-grabbing ${isExpanded
              ? "w-80 flex-shrink-0 border-r border-border/30 px-6 py-8 items-center"
              : `px-8 pt-12 pb-10 w-full ${cardLayout === "classic" ? "items-center" : ""}`
              }`}
          >
            {/* ── CLASSIC LAYOUT: Centered, photo on top ── */}
            {(cardLayout === "classic" || isExpanded) && (
              <div className={`flex flex-col items-center w-full ${isExpanded ? "" : ""}`}>
                {/* Brand name */}
                <motion.h1
                  layout="position"
                  className={`font-display font-black text-gradient-amber tracking-tight text-center ${isExpanded ? "text-xl mb-4" : "text-5xl mb-8"
                    } transition-[font-size] duration-300`}
                >
                  60 Watts of Clarity
                </motion.h1>

                {/* Photo */}
                <motion.div
                  layout="position"
                  className={`rounded-full overflow-hidden glow-amber border-2 border-primary/30 ${isExpanded ? "w-20 h-20 mb-3" : "w-32 h-32 mb-6"
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
                  <p className={`font-sans font-semibold text-primary ${isExpanded ? "text-lg" : "text-4xl"}`}>
                    {displayName}
                  </p>
                  <p className={`mt-2 font-sans text-amber-200 ${isExpanded ? "text-sm" : "text-base"}`}>{tagline}</p>
                  <p className={`font-sans text-foreground/80 mt-4 max-w-sm mx-auto leading-relaxed ${isExpanded ? "text-sm" : "text-base"}`}>
                    {bio.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < bio.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                </div>

                {/* Social icons */}
                <div className={isExpanded ? "mt-4" : "mt-6"}>
                  <SocialLinks links={socialLinks} compact={isExpanded} />
                </div>
              </div>
            )}

            {/* ── BOLD LAYOUT: Side-by-side, left-aligned ── */}
            {cardLayout === "bold" && !isExpanded && (
              <div className="flex flex-col w-full">
                {/* Brand name — full width */}
                <motion.h1
                  layout="position"
                  className="font-display font-black text-gradient-amber tracking-tight text-4xl mb-8"
                >
                  60 Watts of Clarity
                </motion.h1>

                {/* Photo + info side by side */}
                <div className="flex items-start gap-6 mb-6">
                  <motion.div
                    layout="position"
                    className="rounded-2xl overflow-hidden glow-amber border-2 border-primary/30 w-28 h-28 flex-shrink-0 transition-all duration-300"
                  >
                    <img
                      src={avatarUrl}
                      alt={`${displayName} - ${tagline}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
                    />
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-primary text-3xl leading-tight">
                      {displayName}
                    </p>
                    <p className="mt-1 font-sans text-amber-200 text-base">{tagline}</p>
                    <p className="font-sans text-foreground/80 mt-3 leading-relaxed text-sm">
                      {bio.split("\n").map((line, i) => (
                        <span key={i}>
                          {line}
                          {i < bio.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>

                {/* Social icons — left aligned */}
                <div className="mt-2">
                  <SocialLinks links={socialLinks} />
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className={`flex gap-3 ${isExpanded ? "mt-4 flex-col w-full" : cardLayout === "bold" ? "mt-6" : "mt-8 justify-center"}`}>
              <button
                onClick={openExplore}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base glow-amber hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20 min-w-[150px]"
              >
                <Search className="w-4 h-4" />
                Explore
              </button>
              {ctaEmbed ? (
                <button
                  onClick={openCta}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm min-w-[150px]"
                >
                  <Calendar className="w-4 h-4" />
                  {ctaLabel}
                </button>
              ) : (
                <a
                  href={ctaUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm min-w-[150px]"
                >
                  <Calendar className="w-4 h-4" />
                  {ctaLabel}
                </a>
              )}
            </div>

            {/* Screen-reader-only shortcut for assistive tech */}
            {!isExpanded && (
              <button
                type="button"
                onClick={openExplore}
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:ring-2 focus:ring-primary/50"
              >
                Open explore panel
              </button>
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
                role="region"
                aria-label="Explore panel"
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

          {/* ── CTA Embed Panel ── */}
          <AnimatePresence>
            {isCtaOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "100%" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 220 }}
                className="flex-1 min-w-0 relative flex flex-col"
                role="region"
                aria-label="Booking panel"
              >
                {/* Close button */}
                <button
                  onClick={closeCta}
                  className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close booking"
                >
                  <X className="w-4 h-4" />
                </button>

                <div
                  className="flex-1 w-full h-full min-h-[60vh] p-4 pt-14 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:min-h-[55vh] [&>iframe]:border-0 [&>iframe]:rounded-xl"
                  dangerouslySetInnerHTML={{ __html: ctaEmbed }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
