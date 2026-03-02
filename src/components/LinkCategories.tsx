import { motion } from "framer-motion";
import { ExternalLink, Calendar, BookOpen, Mic, Video, FileText, type LucideIcon } from "lucide-react";

type LinkItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
};

type LinkCategory = {
  title: string;
  links: LinkItem[];
};

const categories: LinkCategory[] = [
  {
    title: "📅 Book & Connect",
    links: [
      { label: "Book a Free Discovery Call", href: "https://calendly.com", icon: Calendar },
      { label: "Schedule a VIP Strategy Day", href: "https://calendly.com/vip", icon: Calendar },
    ],
  },
  {
    title: "📚 Resources",
    links: [
      { label: "AI for Social Work — Free Guide", href: "#", icon: BookOpen },
      { label: "NASW Ethics & AI Framework", href: "#", icon: FileText },
      { label: "Case Study: AI in Practice", href: "#", icon: FileText },
    ],
  },
  {
    title: "🎙️ Media & Content",
    links: [
      { label: "Listen to the Podcast", href: "#", icon: Mic },
      { label: "Watch on YouTube", href: "#", icon: Video },
    ],
  },
];

const LinkCategories = () => (
  <motion.section
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.5, duration: 0.5 }}
    className="space-y-5"
  >
    {categories.map((cat, ci) => (
      <div key={cat.title}>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5 px-1">
          {cat.title}
        </h3>
        <div className="space-y-2">
          {cat.links.map(({ label, href, icon: Icon }, li) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + ci * 0.1 + li * 0.05, duration: 0.35 }}
              className="group flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-secondary/70 text-foreground border border-border/40 hover:border-primary/40 hover:bg-secondary transition-all duration-200"
            >
              {Icon && (
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
              )}
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
            </motion.a>
          ))}
        </div>
      </div>
    ))}
  </motion.section>
);

export default LinkCategories;
