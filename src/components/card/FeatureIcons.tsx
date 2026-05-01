import { BookOpen, Target, Users, BarChart3 } from "lucide-react";

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface FeatureIconsProps {
  features?: Feature[];
}

const DEFAULT_FEATURES: Feature[] = [
  { icon: <BookOpen className="w-5 h-5" />, title: "AI Literacy", description: "Build confidence and capability across your team." },
  { icon: <Target className="w-5 h-5" />, title: "Strategy", description: "Align AI to real business goals and outcomes." },
  { icon: <Users className="w-5 h-5" />, title: "Workshops", description: "Hands-on sessions that make AI practical and fun." },
  { icon: <BarChart3 className="w-5 h-5" />, title: "Measurable Impact", description: "Track progress and drive lasting results." },
];

const FeatureIcons = ({ features = DEFAULT_FEATURES }: FeatureIconsProps) => (
  <div className="grid grid-cols-4 gap-3">
    {features.map((f, i) => (
      <div key={i} className="flex flex-col items-center text-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          {f.icon}
        </div>
        <p className="text-[11px] font-semibold text-foreground leading-tight">{f.title}</p>
        <p className="text-[10px] text-muted-foreground leading-snug">{f.description}</p>
      </div>
    ))}
  </div>
);

export default FeatureIcons;
