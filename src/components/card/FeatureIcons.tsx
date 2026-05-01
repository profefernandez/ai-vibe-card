interface ServiceCard {
  title: string;
  description: string;
}

interface FeatureIconsProps {
  services?: ServiceCard[];
  minSlots?: number;
}

// Custom SVG icons — no Lucide per design guidelines
const IconAI = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4Z" />
    <path d="M9 12h6M12 9v6" />
  </svg>
);
const IconTarget = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

const ICONS = [IconAI, IconTarget, IconUsers, IconChart];

// Default services shown when no profile services are configured
const DEFAULT_SERVICES: ServiceCard[] = [
  { title: "AI Literacy", description: "Build confidence and capability across your team." },
  { title: "Strategy", description: "Align AI to real business goals and outcomes." },
  { title: "Workshops", description: "Hands-on sessions that make AI practical and fun." },
  { title: "Measurable Impact", description: "Track progress and drive lasting results." },
];

const FeatureIcons = ({
  services = [],
  minSlots = 4,
}: FeatureIconsProps) => {
  const normalizedServices = services.filter((s) => s.title?.trim() || s.description?.trim());
  const slots = normalizedServices.length > 0 ? normalizedServices : DEFAULT_SERVICES;
  const displaySlots = slots.slice(0, Math.max(minSlots, slots.length));

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      {displaySlots.map((service, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <article
            key={`${service.title}-${i}`}
            className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3.5 flex flex-col gap-2.5"
          >
            <div className="inline-flex items-center justify-center self-start w-8 h-8 rounded-lg bg-primary/15 text-primary">
              <Icon />
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-white leading-tight">{service.title}</p>
              <p className="text-[11.5px] text-white/60 leading-snug">{service.description}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default FeatureIcons;
