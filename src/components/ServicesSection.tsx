import { motion } from "framer-motion";

// ── Inline SVG icons (no Lucide dependency) ───────────────────────────────────
const IconWorkshop = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);
const IconAgent = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" />
    <line x1="8" y1="15" x2="8" y2="17" />
    <line x1="16" y1="15" x2="16" y2="17" />
  </svg>
);
const IconTeam = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconVip = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const IconChat = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

interface ServicesSectionProps {
  onAskAbout: (question: string) => void;
}

const services = [
  {
    Icon: IconWorkshop,
    title: "AI Literacy Workshop",
    description: "Curated AI foundations training for social work and public health teams",
    price: "$497",
    per: "per session",
    askPrompt: "Tell me more about the AI Literacy Workshop",
  },
  {
    Icon: IconAgent,
    title: "AI Agent Build",
    description: "Custom no-code AI agent built for your specific practice context",
    price: "$1,997",
    per: "one-time",
    askPrompt: "I'm interested in a custom AI Agent Build",
  },
  {
    Icon: IconTeam,
    title: "Team Training",
    description: "6-week cohort program curated to fit your organizational needs",
    price: "$3,497",
    per: "per cohort",
    askPrompt: "Tell me about the Team Training cohort program",
  },
  {
    Icon: IconVip,
    title: "VIP Strategy Day",
    description: "Full-day intensive AI integration planning for leadership teams",
    price: "$4,997",
    per: "per day",
    askPrompt: "I want to learn about the VIP Strategy Day",
  },
];

const ServicesSection = ({ onAskAbout }: ServicesSectionProps) => (
  <section className="px-6 py-14 bg-secondary/20">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="text-center mb-8"
    >
      <h2 className="text-xl font-semibold text-foreground tracking-tight">
        Services & <span className="text-gradient-amber">Pricing</span>
      </h2>
      <p className="text-sm text-muted-foreground mt-2">
        Select any service to ask the AI assistant for details
      </p>
    </motion.div>

    <div className="space-y-3 max-w-md mx-auto">
      {services.map(({ Icon, title, description, price, per, askPrompt }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.1, duration: 0.4 }}
          className="bg-card/60 rounded-xl p-4 border border-border/40 hover:border-primary/30 transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 text-primary">
              <Icon />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-base font-bold text-primary">{price}</span>
              <p className="text-[10px] text-muted-foreground">{per}</p>
            </div>
          </div>
          <button
            onClick={() => onAskAbout(askPrompt)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/5 border border-primary/15 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
          >
            <IconChat />
            Ask the AI about this
          </button>
        </motion.div>
      ))}
    </div>
  </section>
);

export default ServicesSection;
