import { QRCodeSVG } from "qrcode.react";
import { UserCirclePlus, LinkSimple, CalendarBlank } from "@phosphor-icons/react";

interface FooterBarProps {
  ctaUrl?: string;
  ctaLabel?: string;
  workUrl?: string;
  saveContactUrl?: string;
}

const FooterBar = ({ ctaUrl = "#", ctaLabel = "Book Time", workUrl = "#", saveContactUrl = "#" }: FooterBarProps) => {
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div
      className="rounded-2xl border border-primary/20 bg-card/50 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-primary/10 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--primary) / 0.06) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="flex items-stretch">

        {/* QR + Let's connect */}
        <div className="flex items-center gap-4 px-5 py-4 min-w-0 flex-shrink-0">
          <div className="bg-white rounded-lg p-1.5 flex-shrink-0">
            <QRCodeSVG value={pageUrl} size={56} level="M" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-base leading-tight">Let's connect.</p>
            <p className="text-muted-foreground text-[12px] mt-1 leading-snug max-w-[180px] font-medium">
              Scan to save my card, visit my profile, or book time on my calendar.
            </p>
          </div>
        </div>

        {/* Save Contact */}
        <a
          href={saveContactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3.5 px-5 py-4 hover:bg-primary/5 transition-colors group flex-1 border-l border-border/30"
        >
          <UserCirclePlus size={32} weight="duotone" className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-foreground">Save Contact</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Add my details to your contacts.</p>
          </div>
        </a>

        {/* Pagination dots — center */}
        <div className="flex items-center justify-center gap-1.5 px-4 border-l border-border/30 flex-shrink-0">
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
          className="flex items-center justify-center gap-3.5 px-5 py-4 hover:bg-primary/5 transition-colors group flex-1 border-l border-border/30"
        >
          <LinkSimple size={32} weight="duotone" className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-foreground">View My Work</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Explore resources and case studies.</p>
          </div>
        </a>

        {/* Book Time */}
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3.5 px-5 py-4 hover:bg-primary/5 transition-colors group flex-1 border-l border-border/30"
        >
          <CalendarBlank size={32} weight="duotone" className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-foreground">{ctaLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Schedule a discovery call or workshop.</p>
          </div>
        </a>

      </div>
    </div>
  );
};

export default FooterBar;
