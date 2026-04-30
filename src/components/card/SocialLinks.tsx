import { motion } from "framer-motion";
import {
  Instagram, Linkedin, Twitter, Facebook, Mail, Phone,
  Youtube, Github, Globe, MessageCircle, Camera, Pin,
  type LucideIcon,
} from "lucide-react";
import type { SocialLink } from "@/types";

export type { SocialLink };

const ICON_MAP: Record<string, LucideIcon> = {
  phone: Phone,
  email: Mail,
  linkedin: Linkedin,
  instagram: Instagram,
  twitter: Twitter,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Camera,
  github: Github,
  website: Globe,
  whatsapp: MessageCircle,
  snapchat: Camera,
  threads: MessageCircle,
  pinterest: Pin,
};

interface SocialLinksProps {
  links?: SocialLink[];
  compact?: boolean;
}

const SocialLinks = ({ links, compact = false }: SocialLinksProps) => {
  const socials = links && links.length > 0 ? links : [];

  if (socials.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="flex flex-wrap justify-center gap-3 py-2"
    >
      {socials.map(({ platform, url }, i) => {
        const Icon = ICON_MAP[platform] || Globe;
        return (
          <motion.a
            key={`${platform}-${i}`}
            href={url}
            target={url.startsWith("tel:") || url.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.06, type: "spring", stiffness: 200 }}
            className={`rounded-full bg-secondary/80 flex items-center justify-center text-amber-200 hover:text-foreground hover:bg-primary/10 transition-all duration-200 border border-primary/30 ${compact ? "w-9 h-9" : "w-11 h-11"
              }`}
            aria-label={platform}
          >
            <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} />
          </motion.a>
        );
      })}
    </motion.div>
  );
};

export default SocialLinks;
