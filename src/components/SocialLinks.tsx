import { motion } from "framer-motion";
import { Instagram, Linkedin, Twitter, Facebook, Mail, Phone } from "lucide-react";

const socials = [
  { icon: Phone, href: "tel:+15551234567", label: "Call" },
  { icon: Mail, href: "mailto:hello@60wattsofclarity.com", label: "Email" },
  { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
  { icon: Instagram, href: "https://instagram.com", label: "Instagram" },
  { icon: Twitter, href: "https://twitter.com", label: "X" },
  { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
];

const SocialLinks = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4, duration: 0.5 }}
    className="flex justify-center gap-3 py-2"
  >
    {socials.map(({ icon: Icon, href, label }, i) => (
      <motion.a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5 + i * 0.06, type: "spring", stiffness: 200 }}
        className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 border border-border/30"
        aria-label={label}
      >
        <Icon className="w-5 h-5" />
      </motion.a>
    ))}
  </motion.div>
);

export default SocialLinks;
