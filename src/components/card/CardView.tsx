import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import DOMPurify from "dompurify";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import type { Profile, CardLayout } from "@/types";
import ExplorePanel from "./ExplorePanel";
import { Search, ChevronLeft, Calendar, X } from "lucide-react";
import { applyTheme } from "@/lib/theme";

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

export interface CardViewProps {
  profile: Profile | null;
  siteId?: string | null;
  profileId?: string | null;
  showScanLink?: boolean;
  applyMeta?: boolean;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────────────
// Shown while profile data is loading. Uses the same outer shell as the real
// card so the layout doesn't shift when data arrives.
const CardSkeleton = () => (
  <section
    className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8"
    aria-label="Loading business card"
    aria-busy="true"
  >
    <div className="w-full max-w-lg rounded-3xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden p-8">
      <div className="flex flex-col items-center gap-4">
        {/* site name */}
        <div className="h-7 w-44 rounded-lg bg-primary/10 animate-pulse" />
        {/* avatar */}
        <div className="w-24 h-24 rounded-full bg-muted/30 animate-pulse ring-1 ring-primary/10" />
        {/* display name */}
        <div className="h-6 w-36 rounded-lg bg-muted/40 animate-pulse" />
        {/* tagline */}
        <div className="h-4 w-52 rounded-lg bg-muted/25 animate-pulse" />
        {/* bio lines */}
        <div className="w-full max-w-xs space-y-2 mt-1">
          <div className="h-3 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-3 w-5/6 mx-auto rounded bg-muted/20 animate-pulse" />
          <div className="h-3 w-3/4 mx-auto rounded bg-muted/20 animate-pulse" />
        </div>
        {/* social icons */}
        <div className="flex gap-3 mt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-9 h-9 rounded-full bg-muted/25 animate-pulse" />
          ))}
        </div>
        {/* action buttons */}
        <div className="flex gap-3 mt-4 w-full max-w-xs">
          <div className="h-12 flex-1 rounded-full bg-primary/15 animate-pulse" />
          <div className="h-12 flex-1 rounded-full bg-muted/20 animate-pulse" />
        </div>
      </div>
    </div>
  </section>
);

const CardView = ({ profile, siteId, profileId, showScanLink = false, applyMeta = true }: CardViewProps) => {
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isCtaOpen, setIsCtaOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);

  useEffect(() => {
    if (!profile || !applyMeta) return;
    applyTheme(profile.theme || "dark", profile.accent_color || "amber");

    if (profile.seo_title) {
      document.title = profile.seo_title;
      setMetaTag("og:title", profile.seo_title, true);
      setMetaTag("twitter:title", profile.seo_title);
    }
    if (profile.seo_description) {
      setMetaTag("description", profile.seo_description);
      setMetaTag("og:description", profile.seo_description, true);
      setMetaTag("twitter:description", profile.seo_description);
    }
    if (profile.og_image_url) {
      setMetaTag("og:image", profile.og_image_url, true);
      setMetaTag("twitter:image", profile.og_image_url);
    }
    if (profile.twitter_handle) {
      const handle = profile.twitter_handle.startsWith("@")
        ? profile.twitter_handle
        : `@${profile.twitter_handle}`;
      setMetaTag("twitter:site", handle);
    }
    setMetaTag("og:url", window.location.href, true);
    setMetaTag("og:type", "website", true);
    setMetaTag("twitter:card", "summary_large_image");
  }, [profile, applyMeta]);

  // Show skeleton while profile is loading (null = not yet fetched).
  if (profile === null) return <CardSkeleton />;

  const displayName = profile.display_name || "Tanya Williams";
  const tagline = profile.tagline || "Founder & AI Consultant";
  const bio = profile.bio || "No-code AI agent training for social work professionals.\nGrounded in the NASW Code of Ethics.";
  const avatarUrl = profile.avatar_url || profilePhoto;
  const ctaUrl = profile.cta_url || "#";
  const ctaLabel = profile.cta_label || "Get in Touch";
  const ctaEmbed = profile.cta_embed || "";
  const socialLinks = profile.social_links || [];
  const cardLayout: CardLayout = profile.card_layout || "classic";
  // Brand name — editable via profile.site_name, falls back to a sensible default.
  const siteName = profile.site_name || "60 Watts of Clarity";

  const dragX = useMotionValue(0);
  const DRAG_THRESHOLD = -80;

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    if (info.offset.x < DRAG_THRESHOLD) {
      setIsExploreOpen(true);
    } else if (info.offset.x > -DRAG_THRESHOLD) {
      setIsExploreOpen(false);
    }
    dragX.set(0);
  };

  const openExplore = useCallback(() => { setIsCtaOpen(false); setIsScanOpen(false); setIsExploreOpen(true); }, []);
  const closeExplore = useCallback(() => setIsExploreOpen(false), []);
  const openCta = useCallback(() => { setIsExploreOpen(false); setIsScanOpen(false); setIsCtaOpen(true); }, []);
  const closeCta = useCallback(() => setIsCtaOpen(false), []);
  const openScan = useCallback(() => { setIsExploreOpen(false); setIsCtaOpen(false); setIsScanOpen(true); }, []);
  const closeScan = useCallback(() => setIsScanOpen(false), []);

  const isExpanded = isExploreOpen || isCtaOpen || isScanOpen;

  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8" aria-label="Business card">
      <motion.div
        layout
        transition={{ type: "spring", damping: 32, stiffness: 220 }}
        role="region"
        aria-label={`${displayName} \u2014 ${tagline}`}
        className={`relative w-full rounded-3xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden ${
          isExpanded ? "max-w-5xl" : "max-w-lg"
        }`}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-amber-500/5 blur-2xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle, hsl(38 95% 50% / 0.4) 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute top-1/3 -left-20 w-[140%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent rotate-[-8deg]" />
        </div>

        {/* On mobile, expanded panels stack vertically. On md+ they sit side-by-side. */}
        <div className="relative z-10 flex flex-col md:flex-row h-full">
          <motion.div
            layout
            drag={!isExpanded ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{ x: !isExpanded ? dragX : 0 }}
            className={`flex flex-col cursor-grab active:cursor-grabbing ${
              isExpanded
                ? "md:w-80 w-full flex-shrink-0 md:border-r border-b md:border-b-0 border-border/30 px-6 py-8 items-center justify-center"
                : `px-6 pt-8 pb-8 w-full ${cardLayout === "classic" ? "items-center" : ""}`
            }`}
          >
            {(cardLayout === "classic" || isExpanded) && (
              <div className={`flex flex-col items-center w-full`}>
                <motion.h1
                  layout="position"
                  className={`font-display font-semibold text-gradient-amber tracking-tight text-center ${
                    isExpanded ? "text-lg mb-3" : "text-3xl mb-6"
                  } transition-[font-size] duration-300`}
                >
                  {siteName}
                </motion.h1>

                {/* Classic layout avatar now includes the same glow as the bold layout
                    for visual consistency and brand polish. */}
                <motion.div
                  layout="position"
                  className={`rounded-full overflow-hidden border border-primary/40 ${
                    isExpanded ? "w-20 h-20 mb-3" : "w-24 h-24 mb-4 glow-amber"
                  } transition-all duration-300`}
                >
                  <img
                    src={avatarUrl}
                    alt={`${displayName} - ${tagline}`}
                    className="w-full h-full object-cover"
                    width={96}
                    height={96}
                    loading="eager"
                    onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
                  />
                </motion.div>

                <div className="text-center">
                  <p className={`font-sans font-semibold text-primary ${isExpanded ? "text-lg" : "text-2xl"}`}>
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

                {socialLinks && socialLinks.length > 0 && (
                  <div className={isExpanded ? "mt-4" : "mt-6"}>
                    <SocialLinks links={socialLinks} compact={isExpanded} />
                  </div>
                )}
              </div>
            )}

            {cardLayout === "bold" && !isExpanded && (
              <div className="flex flex-col w-full">
                <motion.h1
                  layout="position"
                  className="font-display font-semibold text-gradient-amber tracking-tight text-2xl mb-6"
                >
                  {siteName}
                </motion.h1>

                <div className="flex items-start gap-6 mb-6">
                  <motion.div
                    layout="position"
                    className="rounded-2xl overflow-hidden glow-amber border-2 border-primary/30 w-28 h-28 flex-shrink-0 transition-all duration-300"
                  >
                    <img
                      src={avatarUrl}
                      alt={`${displayName} - ${tagline}`}
                      className="w-full h-full object-cover"
                      width={112}
                      height={112}
                      loading="eager"
                      onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
                    />
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-primary text-2xl leading-tight">
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

                {socialLinks && socialLinks.length > 0 && (
                  <div className="mt-2">
                    <SocialLinks links={socialLinks} />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons.
                flex-1 lets each button share available space on very small screens
                (320px) without overflowing. sm:flex-none restores fixed widths on
                larger viewports. */}
            <div className={`flex gap-3 flex-wrap ${
              isExpanded ? "mt-4 flex-col w-full" : cardLayout === "bold" ? "mt-6" : "mt-8 justify-center"
            }`}>
              <button
                onClick={openExplore}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base glow-amber hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20 flex-1 sm:flex-none sm:min-w-[150px]"
              >
                <Search className="w-4 h-4" />
                Explore
              </button>
              {ctaEmbed ? (
                <button
                  onClick={openCta}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm flex-1 sm:flex-none sm:min-w-[150px]"
                >
                  <Calendar className="w-4 h-4" />
                  {ctaLabel}
                </button>
              ) : (
                <a
                  href={ctaUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm flex-1 sm:flex-none sm:min-w-[150px]"
                >
                  <Calendar className="w-4 h-4" />
                  {ctaLabel}
                </a>
              )}
              {showScanLink && (
                <button
                  onClick={openScan}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-secondary/90 border border-primary/30 text-primary font-semibold text-base hover:bg-primary/10 hover:scale-105 active:scale-95 transition-all shadow-sm flex-1 sm:flex-none sm:min-w-[150px]"
                  aria-label="Show QR code to scan"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <line x1="14" y1="14" x2="14" y2="21" />
                    <line x1="14" y1="14" x2="21" y2="14" />
                    <line x1="18" y1="18" x2="21" y2="18" />
                    <line x1="18" y1="18" x2="18" y2="21" />
                  </svg>
                  Scan
                </button>
              )}
            </div>

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

          <AnimatePresence mode="popLayout">
            {isExploreOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 220 }}
                className="flex-1 min-w-0 relative md:[height:unset] md:[animation:none]"
                role="region"
                aria-label="Explore panel"
              >
                <motion.div
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    onClick={closeExplore}
                    className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close explore"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <ExplorePanel siteId={siteId} profileId={profileId} onClose={closeExplore} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {isCtaOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 220 }}
                className="flex-1 min-w-0 relative flex flex-col"
                role="region"
                aria-label="Booking panel"
              >
                <button
                  onClick={closeCta}
                  className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close booking"
                >
                  <X className="w-4 h-4" />
                </button>

                <div
                  className="flex-1 w-full h-full min-h-[60vh] p-4 pt-14 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:min-h-[55vh] [&>iframe]:border-0 [&>iframe]:rounded-xl"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ctaEmbed, { ADD_TAGS: ["iframe"], ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"] }) }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {isScanOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 220 }}
                className="flex-1 min-w-0 relative flex flex-col items-center justify-center p-8"
                role="region"
                aria-label="QR code"
              >
                <button
                  onClick={closeScan}
                  className="absolute top-4 right-4 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close QR"
                >
                  <X className="w-4 h-4" />
                </button>
                <p className="text-sm text-muted-foreground mb-4">Scan to share this card</p>
                <div className="bg-white p-4 rounded-2xl">
                  <QRCodeSVG value={typeof window !== "undefined" ? window.location.href : ""} size={220} level="M" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
};

export default CardView;
