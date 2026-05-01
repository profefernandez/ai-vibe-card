import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KbImage } from "@/lib/apiClient";

interface HeroSliderProps {
  slides: HeroSlide[];
  headline?: string;
  subheadline?: string;
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
    url: "",
    caption: "",
  },
];

const HeroSlider = ({ slides, headline, subheadline }: HeroSliderProps) => {
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
                <div className="w-full h-full bg-gradient-to-br from-amber-900/40 via-neutral-900 to-black" />
              )}
              {/* Dark gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* Headline overlay */}
      <div className="absolute inset-0 flex flex-col justify-center px-8 pointer-events-none">
        {headline && (
          <h2
            className="font-display font-bold text-white leading-tight"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)" }}
          >
            {headline.split(" over ").map((part, i) =>
              i === 0 ? (
                <span key={i} className="text-amber-400">{part}<br /></span>
              ) : (
                <span key={i} className="text-white">over {part}</span>
              )
            )}
          </h2>
        )}
        {subheadline && (
          <p className="mt-3 text-white/70 text-sm max-w-[220px] leading-relaxed">
            {subheadline}
          </p>
        )}
      </div>

      {/* Prev / Next arrows — visible on hover */}
      <button
        onClick={scrollPrev}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={scrollNext}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
        aria-label="Next slide"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5" role="tablist" aria-label="Slide navigation">
        {activeSlides.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === selectedIndex}
            aria-label={`Slide ${i + 1}`}
            onClick={() => scrollTo(i)}
            className={`rounded-full transition-all duration-300 ${
              i === selectedIndex
                ? "w-5 h-1.5 bg-amber-400"
                : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSlider;
