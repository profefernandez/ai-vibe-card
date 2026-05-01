import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import DOMPurify from "dompurify";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import type { Profile, CardLayout } from "@/types";
import ExplorePanel from "./ExplorePanel";
import HeroSlider, { kbImagesToSlides } from "./HeroSlider";
import FeatureIcons from "./FeatureIcons";
import FooterBar from "./FooterBar";
import { Search, CalendarDays, Download, X } from "lucide-react";
import { applyTheme } from "@/lib/theme";
import { apiClient as db, type KbImage } from "@/lib/apiClient";

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

const CardView = ({ profile, siteId, profileId, showScanLink = false, applyMeta = true }: CardViewProps) => {
  const [answerKey, setAnswerKey] = useState(0);
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isCtaOpen, setIsCtaOpen] = useState(false);

  const handleAnswer = useCallback(() => setAnswerKey((k) => k + 1), []);

  // Load KB images for the hero slider
  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => {
      if (data?.length) setKbImages(data);
    });
  }, [profileId]);

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
      const handle = profile.twitter_handle.startsWith("@") ? profile.twitter_handle : `@${profile.twitter_handle}`;
      setMetaTag("twitter:site", handle);
    }
    setMetaTag("og:url", window.location.href, true);
    setMetaTag("og:type", "website", true);
    setMetaTag("twitter:card", "summary_large_image");
  }, [profile, applyMeta]);

  const displayName  = profile?.display_name || "Jason Fernandez";
  const tagline      = profile?.tagline      || "AI Literacy Consultant";
  const bio          = profile?.bio          || "I help founders, teams, and professionals cut through the noise and build real AI literacy\u2014so you can think clearly, decide wisely, and lead the future.";
  const avatarUrl    = profile?.avatar_url   || profilePhoto;
  const ctaUrl       = profile?.cta_url      || "#";
  const ctaLabel     = profile?.cta_label    || "Book a Session";
  const ctaEmbed     = profile?.cta_embed    || "";
  const socialLinks  = profile?.social_links || [];
  const siteName     = profile?.site_name    || "60 Watts of Clarity";
  const heroHeadline    = (profile as any)?.hero_headline    || "Clarity over hype.";
  const heroSubheadline = (profile as any)?.hero_subheadline || "AI education and strategy that drives real impact.";
  const testimonialText   = (profile as any)?.testimonial_text   || "\u201cJason has a rare ability to make AI feel clear, practical, and even exciting. Our team felt aligned and inspired.\u201d";
  const testimonialAuthor = (profile as any)?.testimonial_author || "Sarah M. \u2022 Head of Product";
  const workUrl      = (profile as any)?.work_url || "#";
  const saveContactUrl = (profile as any)?.save_contact_url || "#";

  const heroSlides = kbImagesToSlides(kbImages);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">

      {/* ── Top nav bar ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-card/60 backdrop-blur-sm flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          {/* Bolt SVG logo */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" className="text-primary" />
          </svg>
          <span className="font-display font-semibold text-sm text-foreground">{siteName}</span>
        </div>
        {/* AI Concierge badge */}
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          AI Concierge
        </div>
      </header>

      {/* ── Main three-column grid ── */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

        {/* ════════════════════════════════════════
            COLUMN 1 — Profile sidebar
            ════════════════════════════════════════ */}
        <aside
          className="w-full md:w-64 lg:w-72 flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border/30 bg-card/40 overflow-y-auto"
          aria-label="Profile"
        >
          <div className="flex flex-col items-start px-5 pt-6 pb-4 gap-4">

            {/* Avatar */}
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-primary/40 shadow-lg shadow-primary/10 flex-shrink-0">
              <img
                src={avatarUrl}
                alt={`${displayName} — ${tagline}`}
                className="w-full h-full object-cover"
                width={96}
                height={96}
                loading="eager"
                onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
              />
            </div>

            {/* Site name */}
            <div>
              <p
                className="font-display font-bold text-gradient-amber leading-tight"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
              >
                {siteName}
              </p>
            </div>

            {/* Name + tagline */}
            <div>
              <p className="font-sans font-bold text-foreground text-lg leading-tight">{displayName}</p>
              <p className="text-primary text-sm font-medium mt-0.5">{tagline}</p>
            </div>

            {/* Bio */}
            <p className="text-foreground/70 text-sm leading-relaxed">{bio}</p>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <SocialLinks links={socialLinks} />
            )}

            {/* CTA buttons */}
            <div className="flex flex-col gap-2 w-full mt-1">
              {ctaEmbed ? (
                <button
                  onClick={() => setIsCtaOpen(true)}
                  className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all shadow-md shadow-primary/20"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/60">→</span>
                </button>
              ) : (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all shadow-md shadow-primary/20"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/60">→</span>
                </a>
              )}
              <a
                href={saveContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-secondary/80 border border-border/40 text-foreground/80 font-semibold text-sm hover:bg-secondary transition-all"
              >
                <Download className="w-4 h-4" />
                Download My One-Pager
              </a>
            </div>
          </div>
        </aside>

        {/* ════════════════════════════════════════
            COLUMN 2 — Hero slider + features + testimonial
            ════════════════════════════════════════ */}
        <main
          className="flex-1 flex flex-col gap-0 overflow-y-auto min-w-0 border-b md:border-b-0 md:border-r border-border/30"
          aria-label="Content"
        >
          {/* Hero image slider */}
          <div className="relative flex-shrink-0" style={{ height: "clamp(220px, 35vw, 340px)" }}>
            <HeroSlider
              slides={heroSlides}
              headline={heroHeadline}
              subheadline={heroSubheadline}
            />
          </div>

          {/* Feature icons */}
          <div className="px-5 py-4 border-b border-border/20">
            <FeatureIcons />
          </div>

          {/* Testimonial */}
          {testimonialText && (
            <div className="px-5 py-4">
              <blockquote className="border-l-2 border-primary/40 pl-4">
                <p className="text-foreground/80 text-sm italic leading-relaxed">{testimonialText}</p>
                {testimonialAuthor && (
                  <footer className="mt-2 text-primary text-xs font-semibold">{testimonialAuthor}</footer>
                )}
              </blockquote>
            </div>
          )}
        </main>

        {/* ════════════════════════════════════════
            COLUMN 3 — AI Concierge / ExplorePanel
            ════════════════════════════════════════ */}
        <aside
          className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col overflow-hidden"
          aria-label="AI Concierge"
        >
          <ExplorePanel
            siteId={siteId}
            profileId={profileId}
            onClose={() => {}}
            onAnswer={handleAnswer}
            hideBanner
            alwaysOpen
          />
        </aside>

      </div>

      {/* ── Footer bar ── */}
      <FooterBar
        ctaUrl={ctaUrl}
        ctaLabel={ctaLabel}
        workUrl={workUrl}
        saveContactUrl={saveContactUrl}
      />

      {/* ── Booking embed modal ── */}
      {isCtaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-card rounded-2xl border border-border/40 overflow-hidden shadow-2xl"
          >
            <button
              onClick={() => setIsCtaOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close booking"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="w-full min-h-[60vh] p-4 pt-12 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:min-h-[55vh] [&>iframe]:border-0 [&>iframe]:rounded-xl"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ctaEmbed, { ADD_TAGS: ["iframe"], ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"] }) }}
            />
          </motion.div>
        </div>
      )}

      {/* ── QR modal ── */}
      {isScanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex flex-col items-center gap-4 bg-card rounded-2xl border border-border/40 p-8 shadow-2xl"
          >
            <button
              onClick={() => setIsScanOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close QR"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-sm text-muted-foreground">Scan to share this card</p>
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={typeof window !== "undefined" ? window.location.href : ""} size={220} level="M" />
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};

export default CardView;
