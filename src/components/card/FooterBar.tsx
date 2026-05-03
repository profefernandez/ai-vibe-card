import { QRCodeSVG } from "qrcode.react";
import { UserCirclePlus, LinkSimple, CalendarBlank } from "@phosphor-icons/react";

interface FooterBarProps {
  ctaUrl?: string;
  ctaLabel?: string;
  workUrl?: string;
  saveContactUrl?: string;
  slug?: string;
}

const FooterBar = ({ ctaUrl = "#", ctaLabel = "Book Time", workUrl = "#", saveContactUrl, slug }: FooterBarProps) => {
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  // Derive vCard URL from slug if available, otherwise fall back to prop or #.
  // The vCard download is served by the `card-vcard` Supabase Edge Function
  // (deployed with `--no-verify-jwt`); we hit it directly so a normal anchor
  // navigation triggers the file download.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const legacyApiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  const vcardUrl = slug
    ? supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/card-vcard?slug=${encodeURIComponent(slug)}`
      : `${legacyApiBase}/card/${encodeURIComponent(slug)}/vcard`
    : (saveContactUrl ?? "#");
  const actionTileClass =
    "flex flex-1 items-center justify-center gap-2.5 sm:gap-3.5 px-3 sm:px-5 py-4 hover:bg-primary/6 transition-all duration-200 group";
  const actionIconClass =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-primary/18 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] flex-shrink-0";

  return (
    <div
      className="rounded-2xl border border-primary/20 bg-card/50 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-primary/10 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--primary) / 0.06) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      {/* Mobile: QR strip on top, action tiles below. sm+: single horizontal row */}
      <div className="flex flex-col sm:flex-row sm:items-stretch">

        {/* QR + Let's connect */}
        <div className="flex items-center gap-4 px-5 py-4 min-w-0 sm:flex-shrink-0 border-b border-border/30 sm:border-b-0 sm:min-w-[260px] bg-gradient-to-r from-primary/6 to-transparent">
          <div className="bg-white rounded-xl p-1.5 flex-shrink-0 shadow-lg shadow-black/25">
            <QRCodeSVG value={pageUrl} size={52} level="M" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-base leading-tight">Let's connect.</p>
            <p className="text-muted-foreground text-[12px] mt-1 leading-snug max-w-[210px] font-medium">
              Scan to save my card, visit my profile, or book time on my calendar.
            </p>
          </div>
        </div>

        {/* Action tiles — divide-x handles the vertical separators */}
        <div className="flex flex-1 divide-x divide-border/30 sm:border-l sm:border-border/30">

          {/* Save Contact */}
          <a
            href={vcardUrl}
            download
            className={actionTileClass}
            aria-label="Download contact card (.vcf)"
          >
            <span className={actionIconClass}>
              <UserCirclePlus size={22} weight="duotone" className="text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] sm:text-[13.5px] font-bold text-foreground">Save Contact</p>
              <p className="hidden sm:block text-[11px] text-muted-foreground mt-0.5 font-medium">Add my details to your contacts.</p>
            </div>
          </a>

          {/* Pagination dots — desktop only (decorative) */}
          <div className="hidden sm:flex items-center justify-center gap-1.5 px-4 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            <span className="w-5 h-1.5 rounded-full bg-primary" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
          </div>

          {/* View My Work */}
          <a
            href={workUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={actionTileClass}
          >
            <span className={actionIconClass}>
              <LinkSimple size={22} weight="duotone" className="text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] sm:text-[13.5px] font-bold text-foreground">View My Work</p>
              <p className="hidden sm:block text-[11px] text-muted-foreground mt-0.5 font-medium">Explore resources and case studies.</p>
            </div>
          </a>

          {/* Book Time */}
          <a
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={actionTileClass}
          >
            <span className={actionIconClass}>
              <CalendarBlank size={22} weight="duotone" className="text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] sm:text-[13.5px] font-bold text-foreground">{ctaLabel}</p>
              <p className="hidden sm:block text-[11px] text-muted-foreground mt-0.5 font-medium">Schedule a discovery call or workshop.</p>
            </div>
          </a>

        </div>
      </div>
    </div>
  );
};

export default FooterBar;
