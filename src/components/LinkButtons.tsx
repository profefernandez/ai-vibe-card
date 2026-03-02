import { motion } from "framer-motion";
import { Calendar, Instagram, Linkedin, Twitter, Facebook, Mail, Phone, ExternalLink, Globe } from "lucide-react";

const links = [
  {
    icon: Calendar,
    label: "Book a Free Discovery Call",
    href: "https://calendly.com",
    featured: true,
  },
  {
    icon: Globe,
    label: "Visit Our Website",
    href: "https://60wattsofclarity.com",
  },
  {
    icon: Linkedin,
    label: "Connect on LinkedIn",
    href: "https://linkedin.com",
  },
  {
    icon: Instagram,
    label: "Follow on Instagram",
    href: "https://instagram.com",
  },
  {
    icon: Twitter,
    label: "Follow on X",
    href: "https://twitter.com",
  },
  {
    icon: Facebook,
    label: "Like on Facebook",
    href: "https://facebook.com",
  },
  {
    icon: Mail,
    label: "Email Us",
    href: "mailto:hello@60wattsofclarity.com",
  },
  {
    icon: Phone,
    label: "Call Us",
    href: "tel:+15551234567",
  },
];

const LinkButtons = () => (
  <motion.section
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4, duration: 0.5 }}
    className="space-y-3"
  >
    {links.map(({ icon: Icon, label, href, featured }, i) => (
      <motion.a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 + i * 0.06, duration: 0.4 }}
        className={`group flex items-center gap-4 w-full px-5 py-4 rounded-2xl font-semibold text-base transition-all duration-300 ${
          featured
            ? "bg-primary text-primary-foreground glow-amber hover:scale-[1.02]"
            : "bg-secondary/80 text-foreground border border-border/40 hover:border-primary/40 hover:bg-secondary"
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          featured ? "bg-primary-foreground/15" : "bg-primary/10"
        }`}>
          <Icon className={`w-5 h-5 ${featured ? "text-primary-foreground" : "text-primary"}`} />
        </div>
        <span className="flex-1">{label}</span>
        <ExternalLink className={`w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity ${
          featured ? "text-primary-foreground" : "text-muted-foreground"
        }`} />
      </motion.a>
    ))}
  </motion.section>
);

export default LinkButtons;
