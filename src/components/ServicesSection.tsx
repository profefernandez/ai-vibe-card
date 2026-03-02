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
    transition={{ delay: 0.7, duration: 0.5 }}
    className="px-6 pb-6"
  >
    <h2 className="text-lg font-display font-bold text-foreground mb-4">
      Services & Pricing
    </h2>
    <div className="space-y-3">
      {services.map(({ icon: Icon, title, description, price, per }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 + i * 0.1, duration: 0.4 }}
          className="bg-gradient-card rounded-xl p-4 border border-border/50 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-bold text-primary">{price}</span>
              <p className="text-[10px] text-muted-foreground">{per}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.section>
);

export default ServicesSection;
