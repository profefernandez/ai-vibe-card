import { BarChart3, BrainCircuit, Compass, Sparkles, Users } from "lucide-react";

interface ServiceCard {
  title: string;
  description: string;
}

interface FeatureIconsProps {
  services?: ServiceCard[];
  minSlots?: number;
}

const FEATURE_ICONS = [Sparkles, Compass, Users, BarChart3, BrainCircuit];

const buildSkeletonSlots = (count: number): ServiceCard[] =>
  Array.from({ length: count }, (_, index) => ({
    title: `Service ${index + 1}`,
    description: "Add a short summary so visitors immediately understand the outcome.",
  }));

const FeatureIcons = ({
  services = [],
  minSlots = 4,
}: FeatureIconsProps) => {
  const normalizedServices = services.filter((service) => service.title?.trim() || service.description?.trim());
  const hasServices = normalizedServices.length > 0;
  const slots = hasServices
    ? normalizedServices
    : buildSkeletonSlots(Math.max(minSlots, 1));

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
      {slots.map((service, i) => {
        const isSkeleton = !hasServices;
        const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];

        return (
          <article
            key={`${service.title}-${i}`}
            className="rounded-[1.1rem] border border-white/12 bg-black/38 backdrop-blur-sm px-3.5 py-3.5 flex flex-col gap-2.5 min-h-[138px] shadow-[0_18px_36px_-24px_rgba(0,0,0,0.85)]"
          >
            {isSkeleton ? (
              <>
                <div className="inline-flex items-center justify-center self-start w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary/70">
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div className="h-3.5 w-2/3 rounded bg-foreground/15 animate-pulse" aria-hidden="true" />
                <div className="space-y-1.5" aria-hidden="true">
                  <div className="h-2.5 w-full rounded bg-muted-foreground/15 animate-pulse" />
                  <div className="h-2.5 w-5/6 rounded bg-muted-foreground/15 animate-pulse" />
                </div>
                <span className="sr-only">Service slot placeholder</span>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center self-start w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-sm shadow-primary/10">
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[13px] font-semibold text-white leading-tight tracking-tight">{service.title}</p>
                  <p className="text-[11.5px] text-white/72 leading-snug font-medium">{service.description}</p>
                </div>
                <div className="mt-auto h-px bg-gradient-to-r from-primary/25 via-white/5 to-transparent" aria-hidden="true" />
              </>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default FeatureIcons;
