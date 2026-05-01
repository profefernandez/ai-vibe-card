import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import DOMPurify from "dompurify";
import profilePhoto from "@/assets/profile-photo.png";
import SocialLinks from "./SocialLinks";
import type { Profile } from "@/types";
import ExplorePanel from "./ExplorePanel";
import HeroSlider, { kbImagesToSlides } from "./HeroSlider";
import FeatureIcons from "./FeatureIcons";
import FooterBar from "./FooterBar";
import LayoutTuner, { type LayoutTunerValues } from "./LayoutTuner";
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

// Clean panel — dark card bg, subtle border, no texture
const PANEL_CLASS =
  "rounded-2xl border border-white/8 bg-[hsl(222_22%_10%)] relative overflow-hidden";

// No dot texture — clean flat panels matching target design
const PANEL_DOT_TEXTURE: React.CSSProperties = {};

const LAYOUT_TUNER_STORAGE_KEY = "card-layout-tuner:v1";

const DEFAULT_LAYOUT_TUNER_VALUES: LayoutTunerValues = {
  leftRatio: 19,
  rightRatio: 26,
  gap: 10,
  gridShiftY: 0,
  leftOffsetY: 0,
  middleOffsetY: 0,
  rightOffsetY: 0,
  heroMinHeight: 340,
  heroOffsetY: 0,
  featureOffsetY: 0,
  testimonialOffsetY: 0,
};

type DragTarget = "left" | "right";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTrack(ratio: number) {
  return `calc((100% - (2 * var(--card-grid-gap))) * ${ratio / 100})`;
}

const CardView = ({ profile, siteId, profileId, showScanLink = false, applyMeta = true }: CardViewProps) => {
  const [answerKey, setAnswerKey] = useState(0);
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
  const [isCtaOpen, setIsCtaOpen] = useState(false);
  const [layoutTunerValues, setLayoutTunerValues] = useState<LayoutTunerValues>(DEFAULT_LAYOUT_TUNER_VALUES);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isDev = import.meta.env.DEV;

  const handleAnswer = useCallback(() => setAnswerKey((k) => k + 1), []);

  const middleRatio = useMemo(
    () => 100 - layoutTunerValues.leftRatio - layoutTunerValues.rightRatio,
    [layoutTunerValues.leftRatio, layoutTunerValues.rightRatio],
  );

  const gridTemplateColumns = useMemo(
    () => [layoutTunerValues.leftRatio, middleRatio, layoutTunerValues.rightRatio].map(formatTrack).join(" "),
    [layoutTunerValues.leftRatio, middleRatio, layoutTunerValues.rightRatio],
  );

  const rootStyle = useMemo(
    () => ({
      ...getCardTypographyStyles(profile?.font_family),
      backgroundImage:
        "linear-gradient(180deg, hsl(222 25% 6%) 0%, hsl(222 25% 5%) 100%)",
      "--card-grid-gap": `${layoutTunerValues.gap}px`,
      "--desktop-grid-columns": gridTemplateColumns,
      "--card-grid-shift-y": `${layoutTunerValues.gridShiftY}px`,
      "--profile-offset-y": `${layoutTunerValues.leftOffsetY}px`,
      "--content-offset-y": `${layoutTunerValues.middleOffsetY}px`,
      "--chat-offset-y": `${layoutTunerValues.rightOffsetY}px`,
      "--hero-min-height": `${layoutTunerValues.heroMinHeight}px`,
      "--hero-offset-y": `${layoutTunerValues.heroOffsetY}px`,
      "--feature-offset-y": `${layoutTunerValues.featureOffsetY}px`,
      "--testimonial-offset-y": `${layoutTunerValues.testimonialOffsetY}px`,
    }) as React.CSSProperties,
    [gridTemplateColumns, layoutTunerValues, profile?.font_family],
  );

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LAYOUT_TUNER_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<LayoutTunerValues>;
      setLayoutTunerValues((current) => ({ ...current, ...parsed }));
    } catch {
      window.localStorage.removeItem(LAYOUT_TUNER_STORAGE_KEY);
    }
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    window.localStorage.setItem(LAYOUT_TUNER_STORAGE_KEY, JSON.stringify(layoutTunerValues));
  }, [isDev, layoutTunerValues]);

  useEffect(() => {
    if (!dragTarget || !gridRef.current) return;

    const handleMove = (event: MouseEvent) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;

      const usableWidth = rect.width - layoutTunerValues.gap * 2;
      if (usableWidth <= 0) return;

      const minLeftRatio = (190 / usableWidth) * 100;
      const minMiddleRatio = (360 / usableWidth) * 100;
      const minRightRatio = (260 / usableWidth) * 100;

      if (dragTarget === "left") {
        const nextLeftRatio = clamp(
          (((event.clientX - rect.left) - layoutTunerValues.gap / 2) / usableWidth) * 100,
          minLeftRatio,
          100 - layoutTunerValues.rightRatio - minMiddleRatio,
        );
        setLayoutTunerValues((current) => ({ ...current, leftRatio: Number(nextLeftRatio.toFixed(2)) }));
        return;
      }

      const nextRightRatio = clamp(
        (((rect.right - event.clientX) - layoutTunerValues.gap / 2) / usableWidth) * 100,
        minRightRatio,
        100 - layoutTunerValues.leftRatio - minMiddleRatio,
      );
      setLayoutTunerValues((current) => ({ ...current, rightRatio: Number(nextRightRatio.toFixed(2)) }));
    };

    const handleUp = () => setDragTarget(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragTarget, layoutTunerValues.gap, layoutTunerValues.leftRatio, layoutTunerValues.rightRatio]);

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
      style={rootStyle}
    >

      {/* ── AAA: Skip navigation links — first focusable elements in DOM ── */}
      <a
        href="#ai-chat-input"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-xl focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to AI Chat
      </a>
      <a
        href="#card-profile"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-3 focus:left-40 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-xl focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to Profile
      </a>

      {/* ── Top nav bar — clean, no separator ── */}
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0" role="banner">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" className="text-primary" />
          </svg>
          <span className="font-semibold text-[13px] text-foreground/90 tracking-tight">{siteName}</span>
        </div>
        <div className="flex items-center gap-1.5" aria-label="AI Concierge active">
          <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="text-[13px] text-foreground/80 font-semibold">AI Concierge</span>
        </div>
      </header>

      {/* ── Three-column bento grid ── */}
      {/* md (768px): 2-col profile+content; xl (1280px+): add AI panel column */}
      <div
        ref={gridRef}
        className="relative flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] xl:[grid-template-columns:var(--desktop-grid-columns)] px-3 pb-3 pt-3 min-h-0"
        style={{
          gap: "var(--card-grid-gap)",
          transform: "translateY(var(--card-grid-shift-y))",
        }}
      >

        {isDev && (
          <>
            <button
              type="button"
              aria-label="Resize between profile and middle panels"
              onMouseDown={() => setDragTarget("left")}
              className="absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 cursor-col-resize items-center justify-center rounded-full bg-primary/10 text-primary xl:flex"
              style={{
                left: `calc(${formatTrack(layoutTunerValues.leftRatio)} + (var(--card-grid-gap) / 2))`,
              }}
            >
              <span className="h-10 w-1 rounded-full bg-primary/70" />
            </button>
            <button
              type="button"
              aria-label="Resize between middle and chat panels"
              onMouseDown={() => setDragTarget("right")}
              className="absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 cursor-col-resize items-center justify-center rounded-full bg-primary/10 text-primary xl:flex"
              style={{
                left: `calc(${formatTrack(layoutTunerValues.leftRatio)} + ${formatTrack(middleRatio)} + (var(--card-grid-gap) * 1.5))`,
              }}
            >
              <span className="h-10 w-1 rounded-full bg-primary/70" />
            </button>
          </>
        )}

        {/* ════════════════════════════════════════
            COLUMN 1 — Profile card
            ════════════════════════════════════════ */}
        <aside
          id="card-profile"
          className={`${PANEL_CLASS} flex flex-col overflow-y-auto`}
          style={{
            ...PANEL_DOT_TEXTURE,
            transform: "translateY(var(--profile-offset-y))",
          }}
          aria-label="Profile information"
        >
          <div className="flex flex-col items-center text-center px-5 md:px-6 pt-7 pb-6 gap-4">

            {/* Avatar */}
            <div className="w-[130px] h-[130px] md:w-[140px] md:h-[140px] rounded-2xl overflow-hidden border border-white/15 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] flex-shrink-0">
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

            {/* Site name */}
            <p
              className="card-font-display font-bold leading-[1.05] bg-clip-text text-transparent"
              style={{
                fontSize: "clamp(1.55rem, 2vw, 2rem)",
                backgroundImage: "linear-gradient(160deg, hsl(38 95% 62%), hsl(38 85% 48%))",
              }}
            >
              {siteName}
            </p>

            {/* Name + tagline */}
            <div className="space-y-1.5">
              <p className="font-bold text-white text-[1.35rem] leading-tight tracking-tight">{displayName}</p>
              <p className="text-primary text-[14px] font-semibold">{tagline}</p>
            </div>

            {/* Bio */}
            <p className="text-foreground/65 text-[13px] leading-relaxed font-normal max-w-[26ch]">{bio}</p>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <SocialLinks links={socialLinks} compact />
            )}

            {/* CTA buttons */}
            <div className="flex flex-col gap-2.5 w-full mt-1">
              {ctaEmbed ? (
                <button
                  onClick={() => setIsCtaOpen(true)}
                  className="flex items-center justify-between gap-2 w-full px-5 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(245,158,11,0.35)] focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[48px]"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/80 text-base">→</span>
                </button>
              ) : (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 w-full px-5 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(245,158,11,0.35)] focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[48px]"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {ctaLabel}
                  </span>
                  <span className="text-primary-foreground/80 text-base">→</span>
                </a>
              )}
              <a
                href={saveContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-transparent border border-white/20 text-foreground/80 font-semibold text-[14px] hover:bg-white/5 hover:border-white/30 transition-all focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[48px]"
              >
                <Download className="w-4 h-4" />
                Download My One-Pager
              </a>
            </div>
          </div>
        </aside>

        {/* ════════════════════════════════════════
            COLUMN 2 — Hero + features + testimonial
            ════════════════════════════════════════ */}
        <main
          id="main-content"
          className={`${PANEL_CLASS} flex min-w-0 overflow-hidden relative`}
          style={{
            ...PANEL_DOT_TEXTURE,
            transform: "translateY(var(--content-offset-y))",
          }}
          aria-label="Services and content"
        >
          {/* Hero image — fills top ~60% of panel */}
          <div
            className="absolute inset-0"
            style={{ transform: "translateY(var(--hero-offset-y))" }}
          >
            <HeroSlider
              slides={heroSlides}
              headline={heroHeadline}
              subheadline={heroSubheadline}
              controlsBottomClassName="bottom-[14rem] md:bottom-[15rem]"
              overlayClassName="justify-start px-6 md:px-7 pt-7 md:pt-8"
            />
          </div>

          {/* Bottom content — features + testimonial */}
          <div className="relative z-10 mt-auto flex w-full flex-col bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-32 md:pt-36">
            <div
              className="px-4 md:px-5 pb-4 flex-shrink-0"
              style={{ transform: "translateY(var(--feature-offset-y))" }}
            >
              <FeatureIcons
                services={serviceItems}
                minSlots={Math.max(4, serviceItems.length || 0)}
              />
            </div>

            {testimonialText && (
              <div className="mx-4 mb-4 flex-shrink-0" style={{ transform: "translateY(var(--testimonial-offset-y))" }}>
                <div className="rounded-xl border border-white/10 bg-black/50 px-5 py-4">
                  <blockquote className="flex items-start gap-3">
                    <span className="card-font-display text-primary text-2xl leading-none flex-shrink-0 -mt-0.5">&ldquo;</span>
                    <div className="min-w-0">
                      <p className="text-foreground/88 text-[14px] leading-relaxed">{testimonialText.replace(/^[\u201c\u201d]|[\u201c\u201d]$/g, "")}</p>
                      {testimonialAuthor && (
                        <footer className="mt-2 text-primary text-[12px] font-semibold">{testimonialAuthor}</footer>
                      )}
                    </div>
                  </blockquote>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ════════════════════════════════════════
            COLUMN 3 — AI Concierge panel
            At md: spans both columns below profile+content
            At xl: becomes the 3rd column
            ════════════════════════════════════════ */}
        <aside
          className={`${PANEL_CLASS} flex flex-col overflow-hidden min-w-0 md:col-span-2 xl:col-span-1 min-h-[420px] xl:min-h-0`}
          style={{
            ...PANEL_DOT_TEXTURE,
            transform: "translateY(var(--chat-offset-y))",
          }}
          aria-label="AI Concierge chat"
        >
          <ExplorePanel
            siteId={siteId}
            profileId={profileId}
            assistantAvatarUrl={avatarUrl}
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
          slug={profile?.slug}
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

      {isDev && (
        <LayoutTuner
          values={layoutTunerValues}
          onChange={setLayoutTunerValues}
          onReset={() => setLayoutTunerValues(DEFAULT_LAYOUT_TUNER_VALUES)}
        />
      )}

    </div>
  );
};

export default CardView;
