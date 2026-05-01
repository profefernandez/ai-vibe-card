import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db, type KbImage } from "@/lib/apiClient";
import { ImageIcon } from "lucide-react";

interface PhotoStageProps {
  profileId?: string | null;
  /** Increment this value each time an AI answer arrives to advance the photo. */
  answerKey?: number;
}

const PhotoStage = ({ profileId, answerKey = 0 }: PhotoStageProps) => {
  const [images, setImages] = useState<KbImage[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => setImages(data));
  }, [profileId]);

  // Advance photo on each new AI answer
  useEffect(() => {
    if (answerKey === 0 || images.length === 0) return;
    setIndex((i) => (i + 1) % images.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerKey]);

  // Auto-advance every 7s when idle
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [images.length]);

  const current = images.length > 0 ? images[index % images.length] : null;

  return (
    <div className="flex flex-col items-center justify-between h-full px-6 py-8 gap-4 relative">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="w-56 h-56 rounded-full bg-primary/8 blur-3xl" />
      </div>

      {/* Header label */}
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em] z-10 select-none">
        Gallery
      </p>

      {/* Photo area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full z-10 gap-5">
        {current ? (
          <>
            {/* Polaroid-style frame — advances with each AI answer */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id ?? index}
                initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0.8 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white p-3 pb-9 w-full max-w-[240px]"
                style={{
                  borderRadius: "2px",
                  boxShadow:
                    "0 24px 64px -12px rgba(0,0,0,0.65), 0 4px 16px -4px rgba(0,0,0,0.4)",
                }}
              >
                <img
                  src={current.url}
                  alt={current.caption || "Gallery image"}
                  className="w-full aspect-[4/3] object-cover"
                  style={{ borderRadius: "1px" }}
                  loading="lazy"
                  decoding="async"
                />
                {current.caption && (
                  <p className="text-[11px] text-neutral-600 text-center mt-2 font-sans italic line-clamp-2 px-1 leading-tight">
                    {current.caption}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Dot indicators */}
            {images.length > 1 && (
              <div className="flex items-center gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    aria-label={`View photo ${i + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      i === index % images.length
                        ? "w-4 h-1.5 bg-primary"
                        : "w-1.5 h-1.5 bg-border/50 hover:bg-border"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center opacity-30">
            <ImageIcon className="w-10 h-10 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No gallery images yet</p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-muted-foreground/35 text-center z-10 select-none">
        Photos update as you chat
      </p>
    </div>
  );
};

export default PhotoStage;
