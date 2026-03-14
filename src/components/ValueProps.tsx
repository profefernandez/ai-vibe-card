import { motion } from "framer-motion";
import { BookOpen, Bot, Shield } from "lucide-react";

const props = [
  {
    icon: BookOpen,
    title: "Learn AI Literacy",
    description: "Understand the foundations of AI — what it can do, what it can't, and why it matters for social work.",
  },
  {
    icon: Bot,
    title: "Build AI Agents",
    description: "Create custom no-code AI agents tailored to your practice — no engineering degree required.",
  },
  {
    icon: Shield,
    title: "Deploy Ethically",
    description: "Launch AI tools grounded in the NASW Code of Ethics, backed by 90+ research sources.",
  },
];

const ValueProps = () => (
  <section className="px-6 py-16">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="text-center mb-10"
    >
      <h2 className="text-2xl font-display font-bold text-foreground">
        AI is transforming social work.
        <br />
        <span className="text-gradient-amber">Are you ready?</span>
      </h2>
    </motion.div>

    <div className="space-y-4 max-w-md mx-auto">
      {props.map(({ icon: Icon, title, description }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ delay: i * 0.15, duration: 0.4 }}
          className="flex gap-4 items-start p-4 rounded-2xl bg-secondary/50 border border-border/30"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </section>
);

export default ValueProps;
