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
import { CalendarDays, Download, X } from "lucide-react";
import { applyTheme, getCardTypographyStyles } from "@/lib/theme";
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

const PANEL_CLASS =
  "rounded-2xl border border-primary/20 bg-card/50 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-primary/10 relative";

// Subtle dot-grid texture overlay applied to each card panel via inline style.
const PANEL_DOT_TEXTURE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, hsl(var(--primary) / 0.06) 1px, transparent 1px)",
  backgroundSize: "18px 18px",
};

const CardView = ({ profile, siteId, profileId, showScanLink = false, applyMeta = true }: CardViewProps) => {
  const [answerKey, setAnswerKey] = useState(0);
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
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

  const displayName = profile?.display_name || "Jason Fernandez";
  const tagline = profile?.tagline || "AI Literacy Consultant";
  const bio = profile?.bio || "I help founders, teams, and professionals cut through the noise and build real AI literacy—so you can think clearly, decide wisely, and lead the future.";
  const avatarUrl = profile?.avatar_url || profilePhoto;
  const ctaUrl = profile?.cta_url || "#";
  const ctaLabel = profile?.cta_label || "Book a Session";
  const ctaEmbed = profile?.cta_embed || "";
  const socialLinks = profile?.social_links || [];
  const siteName = profile?.site_name || "60 Watts of Clarity";
  const heroHeadline = (profile as any)?.hero_headline || "Clarity over hype.";
  const heroSubheadline = (profile as any)?.hero_subheadline || "AI education and strategy that drives real impact.";
  const testimonialText = (profile as any)?.testimonial_text || "“Jason has a rare ability to make AI feel clear, practical, and even exciting. Our team felt aligned and inspired.”";
  const testimonialAuthor = (profile as any)?.testimonial_author || "Sarah M. • Head of Product";
  const workUrl = (profile as any)?.work_url || "#";
  const saveContactUrl = (profile as any)?.save_contact_url || "#";

  const heroSlides = kbImagesToSlides(kbImages);
  const serviceItems = Array.isArray((profile as any)?.services)
    ? (profile as any).services
      .map((service: any) => ({
        title: service?.title || "",
        description: service?.description || "",
        ctaLabel: service?.ctaLabel || service?.cta_label || ctaLabel,
        ctaUrl: service?.ctaUrl || service?.cta_url || ctaUrl,
      }))
      .filter((service: { title: string; description: string }) => service.title.trim() || service.description.trim())
    : [];

  return (
    <div
      className="business-card-theme card-font-sans min-h-[100dvh] flex flex-col bg-background relative overflow-hidden"
      style={{
        ...getCardTypographyStyles(profile?.font_family),
        backgroundImage:
          "radial-gradient(circle at 50% 30%, hsl(var(--primary) / 0.08), transparent 55%), radial-gradient(circle at 85% 80%, hsl(var(--primary) / 0.05), transparent 50%)",
      }}
    >

      {/* ── Top nav bar ── */}
      <header className="flex items-center justify-between px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" className="text-primary" />
          </svg>
          <span className="card-font-display font-semibold text-xs text-primary tracking-wide">{siteName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-sm shadow-primary/60" />
          AI Concierge
        </div>
      </header>

      {/* ── Header / cards separator — warm strip ── */}
      <div
        className="mx-3 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent flex-shrink-0"
        style={{ boxShadow: "0 0 12px hsl(var(--primary) / 0.35)" }}
        aria-hidden="true"
      />

      {/* ── Three-column bento grid ── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[330px_1fr_380px] gap-3 px-3 pb-3 pt-3 min-h-0">

        {/* ════════════════════════════════════════
            COLUMN 1 — Profile card
            ════════════════════════════════════════ */}
        <aside className={`${PANEL_CLASS} flex flex-col overflow-y-auto`} style={PANEL_DOT_TEXTURE} aria-label="Profile">
          <div className="flex flex-col items-center text-center px-6 pt-7 pb-6 gap-5">

            {/* Avatar */}
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/20 flex-shrink-0">
              <img
                src={avatarUrl}
                alt={`${displayName} — ${tagline}`}
                className="w-full h-full object-cover"
                width={128}
                height={128}
                loading="eager"
                onError={(e) => { (e.target as HTMLImageElement).src = profilePhoto; }}
              />
            </div>

            {/* Site name — warm burnished copper, large, centered */}
            <p
              className="card-font-display font-bold leading-[1.05] bg-clip-text text-transparent"
              style={{
                fontSize: "clamp(2rem, 2.8vw, 2.5rem)",
                backgroundImage: "linear-gradient(180deg, hsl(var(--primary) / 0.98), hsl(var(--accent) / 0.72))",
              }}
            >
              {siteName}
            </p>

            {/* Name + tagline */}
            <div>
              <p className="font-bold text-foreground text-xl leading-tight">{displayName}</p>
              <p className="text-primary text-base font-semibold mt-1">{tagline}</p>
            </div>

            {/* Bio */}
            <p className="text-muted-foreground text-[14px] leading-relaxed font-medium">{bio}</p>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <SocialLinks links={socialLinks} />
            )}

            {/* CTA buttons */}
            <div className="flex flex-col gap-2.5 w-full mt-1">
              {ctaEmbed ? (
                <button
                  onClick={() => setIsCtaOpen(true)}
                  className="flex items-center justify-between gap-2 w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/30"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-[18px] h-[18px]" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/90 text-base">→</span>
                </button>
              ) : (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/30"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-[18px] h-[18px]" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/90 text-base">→</span>
                </a>
              )}
              <a
                href={saveContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full px-5 py-3 rounded-xl bg-secondary/30 border border-primary/25 text-primary font-semibold text-[15px] hover:bg-secondary/50 hover:border-primary/45 transition-all"
              >
                <Download className="w-[18px] h-[18px]" />
                Download My One-Pager
              </a>
            </div>
          </div>
        </aside>

        {/* ════════════════════════════════════════
            COLUMN 2 — Hero + features + testimonial
            ════════════════════════════════════════ */}
        <main className={`${PANEL_CLASS} flex flex-col overflow-hidden min-w-0`} style={PANEL_DOT_TEXTURE} aria-label="Content">

          {/* Hero image — grows to absorb leftover panel height */}
          <div className="p-3 pb-3 flex-1 min-h-[280px]">
            <div className="relative w-full h-full">
              <HeroSlider
                slides={heroSlides}
                headline={heroHeadline}
                subheadline={heroSubheadline}
              />
            </div>
          </div>

          {/* Feature icons — bare 4-column row */}
          <div className="px-5 py-3 flex-shrink-0">
            <FeatureIcons
              services={serviceItems}
              minSlots={Math.max(4, serviceItems.length || 0)}
              defaultCtaLabel={ctaLabel || "Sign Up"}
              defaultCtaUrl={ctaUrl}
            />
          </div>

          {/* Testimonial — sits naturally below */}
          {testimonialText && (
            <div className="mx-3 mb-3 flex-shrink-0">
              <div className="rounded-xl border border-primary/20 bg-secondary/15 px-5 py-4">
                <blockquote className="flex items-start gap-3">
                  <span className="card-font-display text-primary text-3xl leading-none flex-shrink-0 -mt-1">&ldquo;</span>
                  <div className="min-w-0">
                    <p className="text-foreground/90 text-[15px] leading-relaxed font-medium">{testimonialText.replace(/^[“"]|[”"]$/g, "")}</p>
                    {testimonialAuthor && (
                      <footer className="mt-2 text-primary text-[13px] font-semibold tracking-wide">{testimonialAuthor}</footer>
                    )}
                  </div>
                </blockquote>
              </div>
            </div>
          )}
        </main>

        {/* ════════════════════════════════════════
            COLUMN 3 — AI Concierge panel
            ════════════════════════════════════════ */}
        <aside className={`${PANEL_CLASS} flex flex-col overflow-hidden min-w-0`} style={PANEL_DOT_TEXTURE} aria-label="AI Concierge">
          <ExplorePanel
            siteId={siteId}
            profileId={profileId}
            onClose={() => { }}
            onAnswer={handleAnswer}
            hideBanner
            alwaysOpen
          />
        </aside>

      </div>

      {/* ── Footer card ── */}
      <div className="px-3 pb-3">
        <FooterBar
          ctaUrl={ctaUrl}
          ctaLabel={ctaLabel}
          workUrl={workUrl}
          saveContactUrl={saveContactUrl}
        />
      </div>

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

    </div>
  );
};

export default CardView;
