interface ServiceCard {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

interface FeatureIconsProps {
  services?: ServiceCard[];
  minSlots?: number;
  defaultCtaLabel?: string;
  defaultCtaUrl?: string;
}

const buildSkeletonSlots = (count: number): ServiceCard[] =>
  Array.from({ length: count }, (_, index) => ({
    title: `Service ${index + 1}`,
    description: "Add a short summary so visitors immediately understand the outcome.",
  }));

const FeatureIcons = ({
  services = [],
  minSlots = 4,
  defaultCtaLabel = "Sign Up",
  defaultCtaUrl = "",
}: FeatureIconsProps) => {
  const normalizedServices = services.filter((service) => service.title?.trim() || service.description?.trim());
  const hasServices = normalizedServices.length > 0;
  const slots = hasServices
    ? normalizedServices
    : buildSkeletonSlots(Math.max(minSlots, 1));

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {slots.map((service, i) => {
        const isSkeleton = !hasServices;
        const label = service.ctaLabel?.trim() || defaultCtaLabel;
        const url = service.ctaUrl?.trim() || defaultCtaUrl;

        return (
          <article
            key={`${service.title}-${i}`}
            className="rounded-xl border border-primary/20 bg-secondary/20 px-4 py-3 flex flex-col gap-3 min-h-[165px]"
          >
            {isSkeleton ? (
              <>
                <div className="inline-flex items-center self-start rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide text-primary/80 bg-primary/10 border border-primary/20">
                  Service
                </div>
                <div className="h-3.5 w-2/3 rounded bg-foreground/15 animate-pulse" aria-hidden="true" />
                <div className="space-y-1.5" aria-hidden="true">
                  <div className="h-2.5 w-full rounded bg-muted-foreground/15 animate-pulse" />
                  <div className="h-2.5 w-5/6 rounded bg-muted-foreground/15 animate-pulse" />
                </div>
                <div className="mt-auto h-8 w-24 rounded-lg bg-primary/20 animate-pulse" aria-hidden="true" />
                <span className="sr-only">Service slot placeholder</span>
              </>
            ) : (
              <>
                <div className="inline-flex items-center self-start rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide text-primary/80 bg-primary/10 border border-primary/20">
                  Service
                </div>
                <div>
                  <p className="text-[13px] font-bold text-foreground leading-tight">{service.title}</p>
                  <p className="text-[11.5px] text-muted-foreground leading-snug font-medium mt-1">{service.description}</p>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-colors"
                  >
                    {label}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-auto inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold text-primary-foreground/70 bg-primary/35 cursor-not-allowed"
                    aria-label="Set service signup link"
                  >
                    {label}
                  </button>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default FeatureIcons;
