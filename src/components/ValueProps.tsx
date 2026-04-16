import { motion } from "framer-motion";

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);
const IconBot = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" />
    <line x1="8" y1="15" x2="8" y2="17" />
    <line x1="16" y1="15" x2="16" y2="17" />
  </svg>
);
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const props = [
  {
    Icon: IconBook,
    title: "AI Literacy",
    description: "Understand the foundations of AI \u2014 what it can do, what it cannot, and why it matters for social work and public health.",
  },
  {
    Icon: IconBot,
    title: "Custom AI Agents",
    description: "Build no-code AI agents tailored to your specific practice context. No engineering background required.",
  },
  {
    Icon: IconShield,
    title: "Ethical Deployment",
    description: "Launch AI tools grounded in the NASW Code of Ethics, backed by 90+ research sources.",
  },
];

const ValueProps = () => (
  <section className="px-6 py-14">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="text-center mb-8"
    >
      <h2 className="text-xl font-semibold text-foreground tracking-tight">
        AI is changing social work.
        <br />
        <span className="text-gradient-amber">Here is how to stay ahead.</span>
      </h2>
    </motion.div>

    <div className="space-y-3 max-w-md mx-auto">
      {props.map(({ Icon, title, description }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ delay: i * 0.15, duration: 0.4 }}
          className="flex gap-4 items-start p-4 rounded-xl bg-card/50 border border-border/30 shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
            <Icon />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </section>
);

export default ValueProps;
