import { motion } from "framer-motion";
import {
  InstagramLogo, LinkedinLogo, TwitterLogo, FacebookLogo, Envelope, Phone,
  YoutubeLogo, GithubLogo, Globe, WhatsappLogo, SnapchatLogo, PinterestLogo,
  TiktokLogo, ThreadsLogo, MediumLogo,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { SocialLink } from "@/types";

export type { SocialLink };

const ICON_MAP: Record<string, PhosphorIcon> = {
  phone: Phone,
  email: Envelope,
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
  twitter: TwitterLogo,
  facebook: FacebookLogo,
  youtube: YoutubeLogo,
  tiktok: TiktokLogo,
  github: GithubLogo,
  website: Globe,
  whatsapp: WhatsappLogo,
  snapchat: SnapchatLogo,
  threads: ThreadsLogo,
  pinterest: PinterestLogo,
  medium: MediumLogo,
};

// Default skeleton row — shown until the owner adds real social links.
const SKELETON_PLATFORMS = ["linkedin", "twitter", "youtube", "medium", "email"] as const;

interface SocialLinksProps {
  links?: SocialLink[];
  compact?: boolean;
}

const SocialLinks = ({ links, compact = false }: SocialLinksProps) => {
  const hasLinks = !!(links && links.length > 0);
  const items = hasLinks
    ? links!
    : SKELETON_PLATFORMS.map((platform) => ({ platform, url: "" }));

  const size = compact ? 36 : 40;
  const iconSize = compact ? 18 : 20;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="flex flex-wrap justify-center gap-2 py-1"
    >
      {items.map(({ platform, url }, i) => {
        const Icon = ICON_MAP[platform] || Globe;
        const isPlaceholder = !hasLinks;
        const chipClass =
          "rounded-xl flex items-center justify-center transition-all duration-200 border " +
          (isPlaceholder
            ? "bg-secondary/20 border-primary/15 text-primary/35 cursor-default"
            : "bg-secondary/40 border-primary/20 text-primary/80 hover:text-primary hover:bg-secondary/70 hover:border-primary/45");

        if (isPlaceholder) {
          return (
            <motion.span
              key={`skeleton-${platform}-${i}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.06, type: "spring", stiffness: 200 }}
              className={chipClass}
              style={{ width: size, height: size }}
              aria-hidden="true"
            >
              <Icon size={iconSize} weight="fill" />
            </motion.span>
          );
        }

        return (
          <motion.a
            key={`${platform}-${i}`}
            href={url}
            target={url.startsWith("tel:") || url.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.06, type: "spring", stiffness: 200 }}
            className={chipClass}
            style={{ width: size, height: size }}
            aria-label={platform}
          >
            <Icon size={iconSize} weight="fill" />
          </motion.a>
        );
      })}
    </motion.div>
  );
};

export default SocialLinks;
