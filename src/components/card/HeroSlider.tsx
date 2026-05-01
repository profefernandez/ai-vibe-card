import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KbImage } from "@/lib/apiClient";
import lightbulbHero from "@/assets/lightbulb-hero.svg";

interface HeroSliderProps {
  slides: HeroSlide[];
  headline?: string;
  subheadline?: string;
  controlsBottomClassName?: string;
  overlayClassName?: string;
}

export interface HeroSlide {
  id: string;
  url: string;
  caption?: string;
}

/** Maps KB images to hero slides */
export function kbImagesToSlides(images: KbImage[]): HeroSlide[] {
  return images.map((img) => ({
    id: img.id ?? img.url,
    url: img.url,
    caption: img.caption,
  }));
}

/** Fallback gradient slide when no images are uploaded yet */
const FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: "fallback-1",
    url: lightbulbHero,
    caption: "Lightbulb concept background",
  },
];

const HeroSlider = ({
  slides,
  headline,
  subheadline,
  controlsBottomClassName = "bottom-3",
  overlayClassName = "justify-center px-7",
}: HeroSliderProps) => {
  const activeSlides = slides.length > 0 ? slides : FALLBACK_SLIDES;

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true }),
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl group">
      {/* Slides */}
      <div ref={emblaRef} className="overflow-hidden h-full">
        <div className="flex h-full">
          {activeSlides.map((slide) => (
            <div key={slide.id} className="flex-[0_0_100%] min-w-0 relative h-full">
              {slide.url ? (
                <img
                  src={slide.url}
                  alt={slide.caption || "Hero image"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/25 via-neutral-900 to-black" />
              )}
              {/* Dark gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* Headline overlay */}
      <div className={`absolute inset-0 flex flex-col pointer-events-none ${overlayClassName}`}>
        {headline && (
          <h2
            className="card-font-display font-bold leading-[1.05]"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.6rem)" }}
          >
            {headline.split(" over ").map((part, i) =>
              i === 0 ? (
                <span key={i} className="text-primary">{part}<br /></span>
              ) : (
                <span key={i} className="text-white">over {part}</span>
              )
            )}
          </h2>
        )}
        {subheadline && (
          <p className="mt-3 text-white/75 text-[13px] max-w-[210px] leading-relaxed font-medium">
            {subheadline}
          </p>
        )}
      </div>

      {/* Carousel controls — always visible, centered at bottom: ← ●●●●● → */}
      <div
        className={`absolute left-0 right-0 flex items-center justify-center gap-3 px-4 ${controlsBottomClassName}`}
        role="group"
        aria-label="Slide navigation"
      >
        <button
          onClick={scrollPrev}
          className="p-1 rounded-full bg-black/40 text-white/85 hover:bg-black/60 hover:text-white transition-colors"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5" role="tablist">
          {activeSlides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === selectedIndex}
              aria-label={`Slide ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`rounded-full transition-all duration-300 ${i === selectedIndex
                ? "w-5 h-1.5 bg-primary"
                : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                }`}
            />
          ))}
        </div>

        <button
          onClick={scrollNext}
          className="p-1 rounded-full bg-black/40 text-white/85 hover:bg-black/60 hover:text-white transition-colors"
          aria-label="Next slide"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default HeroSlider;
