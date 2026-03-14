import { motion } from "framer-motion";
import { Sparkles, Bot, GraduationCap, Users, MessageCircle } from "lucide-react";

interface ServicesSectionProps {
  onAskAbout: (question: string) => void;
}

const services = [
  {
    icon: GraduationCap,
    title: "AI Literacy Workshop",
    description: "Foundations of AI for social work teams",
    price: "$497",
    per: "per session",
    askPrompt: "Tell me more about the AI Literacy Workshop",
  },
  {
    icon: Bot,
    title: "AI Agent Build",
    description: "Custom no-code AI agent for your practice",
    price: "$1,997",
    per: "one-time",
    askPrompt: "I'm interested in a custom AI Agent Build",
  },
  {
    icon: Users,
    title: "Team Training",
    description: "6-week cohort program for organizations",
    price: "$3,497",
    per: "per cohort",
    askPrompt: "Tell me about the Team Training cohort program",
  },
  {
    icon: Sparkles,
    title: "VIP Strategy Day",
    description: "Full-day intensive AI integration planning",
    price: "$4,997",
    per: "per day",
    askPrompt: "I want to learn about the VIP Strategy Day",
  },
];

const ServicesSection = ({ onAskAbout }: ServicesSectionProps) => (
  <section className="px-6 py-16">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="text-center mb-8"
    >
      <h2 className="text-2xl font-display font-bold text-foreground">
        Services & <span className="text-gradient-amber">Pricing</span>
      </h2>
      <p className="text-sm text-muted-foreground mt-2">
        Tap "Ask Watts" on any service to learn more instantly
      </p>
    </motion.div>

    <div className="space-y-3 max-w-md mx-auto">
      {services.map(({ icon: Icon, title, description, price, per, askPrompt }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.1, duration: 0.4 }}
          className="bg-secondary/70 rounded-2xl p-4 border border-border/40 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-lg font-bold text-primary">{price}</span>
              <p className="text-[10px] text-muted-foreground">{per}</p>
            </div>
          </div>
          <button
            onClick={() => onAskAbout(askPrompt)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/5 border border-primary/15 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
          >
            <MessageCircle className="w-3 h-3" />
            Ask Watts about this
          </button>
        </motion.div>
      ))}
    </div>
  </section>
);

export default ServicesSection;
