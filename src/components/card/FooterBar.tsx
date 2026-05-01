import { QRCodeSVG } from "qrcode.react";
import { UserPlus, Briefcase, CalendarDays } from "lucide-react";

interface FooterBarProps {
  ctaUrl?: string;
  ctaLabel?: string;
  workUrl?: string;
  saveContactUrl?: string;
}

const FooterBar = ({ ctaUrl = "#", ctaLabel = "Book Time", workUrl = "#", saveContactUrl = "#" }: FooterBarProps) => {
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="w-full border-t border-border/30 bg-card/60 backdrop-blur-sm">
      <div className="flex items-stretch divide-x divide-border/30">

        {/* QR + Let's connect */}
        <div className="flex items-center gap-4 px-5 py-4 min-w-0 flex-shrink-0">
          <div className="bg-white rounded-lg p-1.5 flex-shrink-0">
            <QRCodeSVG value={pageUrl} size={52} level="M" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">Let's connect.</p>
            <p className="text-muted-foreground text-xs mt-0.5 leading-snug max-w-[160px]">
              Scan to save my card, visit my profile, or book time on my calendar.
            </p>
          </div>
        </div>

        {/* Save Contact */}
        <a
          href={saveContactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 px-6 py-4 hover:bg-primary/5 transition-colors group flex-1"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-foreground">Save Contact</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Add my details to your contacts.</p>
          </div>
        </a>

        {/* View My Work */}
        <a
          href={workUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 px-6 py-4 hover:bg-primary/5 transition-colors group flex-1"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Briefcase className="w-4 h-4 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-foreground">View My Work</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Explore resources and case studies.</p>
          </div>
        </a>

        {/* Book Time */}
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 px-6 py-4 hover:bg-primary/5 transition-colors group flex-1"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <CalendarDays className="w-4 h-4 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-foreground">{ctaLabel}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Schedule a discovery call or workshop.</p>
          </div>
        </a>

      </div>
    </div>
  );
};

export default FooterBar;
