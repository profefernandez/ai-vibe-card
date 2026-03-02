import { motion } from "framer-motion";
import { Instagram, Linkedin, Twitter, Facebook, Mail, Phone } from "lucide-react";

const links = [
  { icon: Phone, href: "tel:+15551234567", label: "Call", color: "text-primary" },
  { icon: Mail, href: "mailto:hello@60wattsofclarity.com", label: "Email", color: "text-primary" },
  { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn", color: "text-primary" },
  { icon: Instagram, href: "https://instagram.com", label: "Instagram", color: "text-primary" },
  { icon: Twitter, href: "https://twitter.com", label: "X", color: "text-primary" },
  { icon: Facebook, href: "https://facebook.com", label: "Facebook", color: "text-primary" },
];

const SocialLinks = () => (
  <motion.section
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4, duration: 0.5 }}
    className="px-6 pb-6"
  >
    <div className="flex justify-center gap-3">
      {links.map(({ icon: Icon, href, label }, i) => (
        <motion.a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 200 }}
          className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
          aria-label={label}
        >
          <Icon className="w-5 h-5" />
        </motion.a>
      ))}
    </div>
  </motion.section>
);

export default SocialLinks;
