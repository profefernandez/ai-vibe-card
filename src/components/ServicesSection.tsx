import { motion } from "framer-motion";
import { Sparkles, Bot, GraduationCap, Users } from "lucide-react";

const services = [
  {
    icon: GraduationCap,
    title: "AI Literacy Workshop",
    description: "Foundations of AI for social work teams",
    price: "$497",
    per: "per session",
  },
  {
    icon: Bot,
    title: "AI Agent Build",
    description: "Custom no-code AI agent for your practice",
    price: "$1,997",
    per: "one-time",
  },
  {
    icon: Users,
    title: "Team Training",
    description: "6-week cohort program for organizations",
    price: "$3,497",
    per: "per cohort",
  },
  {
    icon: Sparkles,
    title: "VIP Strategy Day",
    description: "Full-day intensive AI integration planning",
    price: "$4,997",
    per: "per day",
  },
];

const ServicesSection = () => (
  <motion.section
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.8, duration: 0.5 }}
  >
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5 px-1">
      💡 Services & Pricing
    </h3>
    <div className="space-y-2">
      {services.map(({ icon: Icon, title, description, price, per }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85 + i * 0.07, duration: 0.35 }}
          className="bg-secondary/70 rounded-2xl p-4 border border-border/40 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-base font-bold text-primary">{price}</span>
              <p className="text-[10px] text-muted-foreground">{per}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.section>
);

export default ServicesSection;
