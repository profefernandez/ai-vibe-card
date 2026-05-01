import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db, type KbImage } from "@/lib/apiClient";
import { ImageIcon } from "lucide-react";

interface PhotoStageProps {
  profileId?: string | null;
  /** Incremented by CardView each time the AI delivers a new answer.
   *  PhotoStage advances to the next image on every increment. */
  answerKey?: number;
}

/**
 * PhotoStage — desktop bento centre column.
 *
 * Renders the profile’s KB images as a polaroid gallery.
 * Advances one frame per AI answer (via answerKey) AND auto-cycles
 * every 7 s when idle. Dot indicators let users jump to any frame.
 */
const PhotoStage = ({ profileId, answerKey = 0 }: PhotoStageProps) => {
  const [images, setImages] = useState<KbImage[]>([]);
  const [index, setIndex] = useState(0);

  // Load gallery images for this profile.
  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => {
      if (data?.length) setImages(data);
    });
  }, [profileId]);

  // Advance one frame every time a new AI answer lands.
  // Skip the initial mount (answerKey === 0).
  useEffect(() => {
    if (answerKey === 0 || images.length === 0) return;
    setIndex((i) => (i + 1) % images.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerKey]);

  // Auto-advance every 7 s when idle.
  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), 7000);
    return () => clearInterval(id);
  }, [images.length]);

  const current = images.length > 0 ? images[index % images.length] : null;

  return (
    <div className="relative flex flex-col items-center justify-between h-full px-6 py-8 gap-4 overflow-hidden">

      {/* Soft amber ambient glow behind the photo */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="w-56 h-56 rounded-full bg-primary/8 blur-3xl" />
      </div>

      {/* Section label */}
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em] z-10 select-none">
        Gallery
      </p>

      {/* Photo area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full z-10 gap-5">
        {current ? (
          <>
            {/* Polaroid frame — slight clockwise tilt, deep cinematic shadow */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id ?? index}
                initial={{ opacity: 0, scale: 0.96, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0.7 }}
                exit={{ opacity: 0, scale: 0.95, rotate: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white p-3 pb-8 w-full max-w-[260px] select-none"
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
                  <p className="text-[11px] text-neutral-500 text-center mt-2 font-sans italic line-clamp-2 px-1 leading-snug">
                    {current.caption}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Dot / pill indicators */}
            {images.length > 1 && (
              <div
                className="flex items-center gap-1.5"
                role="tablist"
                aria-label="Gallery navigation"
              >
                {images.map((_, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === index % images.length}
                    aria-label={`Photo ${i + 1} of ${images.length}`}
                    onClick={() => setIndex(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === index % images.length
                        ? "w-5 h-1.5 bg-primary"
                        : "w-1.5 h-1.5 bg-border/50 hover:bg-border"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          // Empty state
          <div className="flex flex-col items-center gap-3 text-center opacity-30">
            <ImageIcon className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">No gallery images yet</p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-muted-foreground/30 text-center z-10 select-none">
        Photos update as you chat
      </p>
    </div>
  );
};

export default PhotoStage;
