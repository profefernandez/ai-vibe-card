import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db, type KbImage } from "@/lib/apiClient";
import { EXPLORE_SUGGESTIONS } from "@/lib/constants";
import ReactMarkdown from "react-markdown";

interface ExplorePanelProps {
  siteId?: string | null;
  profileId?: string | null;
  onSearch?: (query: string) => void;
  onClose?: () => void;
  /** Called each time a new AI answer lands — used by the desktop layout to
   *  advance the PhotoStage centre column in sync with the chat. */
  onAnswer?: () => void;
  /** When true the polaroid banner at the top is suppressed — the desktop
   *  layout shows photos in the dedicated centre column instead. */
  hideBanner?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type FeedbackRating = "up" | "down";
type FeedbackStatus = "idle" | "pending-comment" | "submitting" | "done";

// ── SVG icons ────────────────────────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const ThumbsUpIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L15 2a3.13 3.13 0 0 1 0 3.88Z" />
  </svg>
);

const ThumbsDownIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L9 22a3.13 3.13 0 0 1 0-3.88Z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

async function postFeedback(payload: {
  profile_id?: string | null;
  rating: FeedbackRating;
  comment?: string;
  question_text?: string;
  answer_text?: string;
  conversation_id?: string | null;
  feedback_token: string;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        profile_id: payload.profile_id || undefined,
        conversation_id: payload.conversation_id || undefined,
      }),
    });
  } catch {
    // Silent — feedback is fire-and-forget. Never block the UI on it.
  }
}

const ExplorePanel = ({
  siteId,
  profileId,
  onSearch,
  onClose,
  onAnswer,
  hideBanner = false,
}: ExplorePanelProps) => {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noContent, setNoContent] = useState(false);

  const [feedbackToken, setFeedbackToken] = useState<string | null>(null);
  const [boundProfileId, setBoundProfileId] = useState<string | null>(null);

  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  // Banner slideshow — suppressed on desktop via hideBanner prop.
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
  const [kbIndex, setKbIndex] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => setKbImages(data));
  }, [profileId]);

  // Advance the slide each time a new answer lands (mobile banner only).
  useEffect(() => {
    if (!answer || kbImages.length === 0) return;
    setKbIndex((i) => (i + 1) % kbImages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  const currentBanner = kbImages.length > 0 ? kbImages[kbIndex % kbImages.length] : null;

  useEffect(() => {
    setFeedbackStatus("idle");
    setFeedbackRating(null);
    setFeedbackComment("");
  }, [activeQuery, answer]);

  const handleRate = (rating: FeedbackRating) => {
    if (feedbackStatus !== "idle") return;
    if (!feedbackToken) return;

    setFeedbackRating(rating);

    if (rating === "up") {
      setFeedbackStatus("done");
      void postFeedback({
        profile_id: boundProfileId ?? profileId ?? null,
        rating,
        question_text: activeQuery ?? undefined,
        answer_text: answer ?? undefined,
        conversation_id: conversationId,
        feedback_token: feedbackToken,
      });
    } else {
      setFeedbackStatus("pending-comment");
    }
  };

  const handleSubmitComment = () => {
    if (!feedbackRating || !feedbackToken) {
      setFeedbackStatus("done");
      return;
    }
    const trimmed = feedbackComment.trim();
    setFeedbackStatus("submitting");
    void postFeedback({
      profile_id: boundProfileId ?? profileId ?? null,
      rating: feedbackRating,
      comment: trimmed.length > 0 ? trimmed.slice(0, 2000) : undefined,
      question_text: activeQuery ?? undefined,
      answer_text: answer ?? undefined,
      conversation_id: conversationId,
      feedback_token: feedbackToken,
    });
    setFeedbackStatus("done");
  };

  const handleSearch = async (text?: string) => {
    const searchText = text || query.trim();
    if (!searchText) return;

    setActiveQuery(searchText);
    setQuery("");
    setLoading(true);
    setNoContent(false);
    setAnswer(null);
    setFeedbackToken(null);
    setBoundProfileId(null);
    onSearch?.(searchText);

    try {
      const { data, error } = await db.functions.invoke("lemonade-chat", {
        body: {
          message: searchText,
          conversation_id: conversationId,
          ...(siteId ? { site_id: siteId } : {}),
        },
      });
      if (error) throw error;

      const result = data as {
        response?: string;
        conversation_id?: string;
        feedback_token?: string;
        profile_id?: string;
      };
      if (result.conversation_id) setConversationId(result.conversation_id);
      setFeedbackToken(result.feedback_token ?? null);
      setBoundProfileId(result.profile_id ?? null);

      if (result.response) {
        setAnswer(result.response);
        // Notify parent (CardView) so the desktop PhotoStage advances.
        onAnswer?.();
      } else {
        setNoContent(true);
      }
    } catch {
      setNoContent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">

      {/*
        Polaroid banner — shown on mobile where there is no dedicated centre
        column. Suppressed on desktop (hideBanner=true) because PhotoStage
        takes over that responsibility in the bento grid.
      */}
      {!hideBanner && currentBanner && (
        <div className="px-6 pt-6 pb-2 flex flex-col items-center">
          <div className="relative w-full max-w-sm">
            <div className="bg-white p-3 pb-5 rounded-md shadow-lg shadow-black/30 rotate-[-0.5deg]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentBanner.id}
                  src={currentBanner.url}
                  alt={currentBanner.caption || "Image"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  className="w-full aspect-[4/3] object-cover rounded-sm"
                />
              </AnimatePresence>
              {currentBanner.caption && (
                <p className="text-xs text-neutral-700 text-center mt-2 font-sans italic line-clamp-1">
                  {currentBanner.caption}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border/30 bg-card/60 backdrop-blur-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Explore
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="relative flex items-center"
        >
          <span className="absolute left-3.5 text-muted-foreground/50">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or ask anything\u2026"
            aria-label="Explore search"
            className="w-full bg-secondary/50 border border-border/40 rounded-xl pl-10 pr-11 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            aria-label="Search"
            className="absolute right-2 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all"
          >
            {loading ? <SpinnerIcon /> : <ArrowIcon />}
          </button>
        </form>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait">

          {/* Suggestions */}
          {!activeQuery && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                Suggested questions
              </p>
              <div className="space-y-2">
                {EXPLORE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="w-full text-left group flex items-center justify-between px-4 py-3 rounded-xl border border-border/30 bg-secondary/30 hover:bg-primary/5 hover:border-primary/25 transition-all duration-200"
                  >
                    <span className="text-sm text-foreground/75 group-hover:text-foreground transition-colors">
                      {s}
                    </span>
                    <span className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors">
                      <ArrowIcon />
                    </span>
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-border/20">
                <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                  Powered by AI \u00b7 Grounded in the NASW Code of Ethics
                </p>
              </div>
            </motion.div>
          )}

          {/* Loading */}
          {activeQuery && loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <SpinnerIcon />
              <p className="text-sm text-muted-foreground">Searching\u2026</p>
            </motion.div>
          )}

          {/* Answer */}
          {activeQuery && !loading && answer && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveQuery(null); setAnswer(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
              </div>
              <div className="rounded-xl bg-card border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">{activeQuery}</p>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>

                {/* Feedback */}
                <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
                  {feedbackStatus === "idle" && (
                    <>
                      <button type="button" onClick={() => handleRate("up")} aria-label="Rate response helpful" className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 -ml-1">
                        <ThumbsUpIcon />
                      </button>
                      <button type="button" onClick={() => handleRate("down")} aria-label="Rate response not helpful" className="text-muted-foreground/60 hover:text-foreground transition-colors p-1">
                        <ThumbsDownIcon />
                      </button>
                    </>
                  )}

                  {feedbackStatus === "pending-comment" && (
                    <div className="w-full flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-muted-foreground/60">
                        {feedbackRating === "up" ? <ThumbsUpIcon /> : <ThumbsDownIcon />}
                        <span className="text-[11px]">Thanks for the feedback.</span>
                      </div>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Anything we should know? (optional)"
                        maxLength={2000}
                        rows={2}
                        className="w-full rounded-lg border border-border/30 bg-background/50 p-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <div className="flex justify-end">
                        <button type="button" onClick={handleSubmitComment} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/90 text-primary-foreground hover:bg-primary transition-colors">
                          Send
                        </button>
                      </div>
                    </div>
                  )}

                  {(feedbackStatus === "submitting" || feedbackStatus === "done") && (
                    <div className="flex items-center gap-1.5 text-muted-foreground/70">
                      <CheckIcon />
                      <span className="text-[11px]">Thanks for the feedback.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Follow-up input */}
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Ask a follow-up\u2026"
                  className="flex-1 bg-secondary/50 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={!query.trim()}
                  aria-label="Send follow-up"
                  className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                >
                  <ArrowIcon />
                </button>
              </div>
            </motion.div>
          )}

          {/* No content */}
          {activeQuery && !loading && noContent && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-3 text-center"
            >
              <p className="text-sm text-muted-foreground">No results found for that query.</p>
              <button
                onClick={() => { setActiveQuery(null); setNoContent(false); }}
                className="text-xs text-primary hover:underline"
              >
                Try another question
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default ExplorePanel;
