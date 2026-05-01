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
  /** Called each time a new AI answer lands — used by the desktop layout
   *  to advance the PhotoStage carousel in the centre column. */
  onAnswer?: () => void;
  /** When true the top polaroid banner is suppressed — the desktop layout
   *  renders photos in its own dedicated centre column instead. */
  hideBanner?: boolean;
  /** When true the panel is always expanded and fills its parent container.
   *  Used by the desktop 3-column layout where the panel is a permanent column. */
  alwaysOpen?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type FeedbackRating = "up" | "down";
type FeedbackStatus = "idle" | "pending-comment" | "submitting" | "done";

// ── SVG icons ─────────────────────────────────────────────────────────────────
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
  alwaysOpen = false,
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

  // Banner slideshow — suppressed when hideBanner=true (desktop centre column
  // owns photo display instead) or when alwaysOpen=true.
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
  const [kbIndex, setKbIndex] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => setKbImages(data));
  }, [profileId]);

  // Advance the slide each time a new answer lands.
  useEffect(() => {
    if (!answer || kbImages.length === 0) return;
    setKbIndex((i) => (i + 1) % kbImages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  const currentBanner = kbImages.length > 0 ? kbImages[kbIndex % kbImages.length] : null;
  const showBanner = !hideBanner && !alwaysOpen && currentBanner;

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
    if (!feedbackRating || !feedbackToken) { setFeedbackStatus("done"); return; }
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
        // ← Notify CardView so the desktop PhotoStage advances to the next image.
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

  // ── alwaysOpen = desktop column mode ─────────────────────────────────────
  // The panel fills its parent flex container completely. No collapse chrome.
  // Layout: header → scrollable content → input pinned to bottom.
  const panelClasses = alwaysOpen
    ? "flex flex-col h-full min-h-0"
    : "flex flex-col h-full bg-background";

  // Welcome timestamp (stable per session)
  const welcomeTime = "10:42";

  return (
    <div className={panelClasses}>

      {/* ── Polaroid banner (mobile only / hideBanner=false / alwaysOpen=false) */}
      {showBanner && (
        <div className="px-6 pt-6 pb-2 flex flex-col items-center">
          <div className="relative w-full max-w-sm">
            <div className="bg-white p-3 pb-5 rounded-md shadow-lg shadow-black/30 rotate-[-0.5deg]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentBanner!.id}
                  src={currentBanner!.url}
                  alt={currentBanner!.caption || "Image"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  className="w-full aspect-[4/3] object-cover rounded-sm"
                />
              </AnimatePresence>
              {currentBanner!.caption && (
                <p className="text-xs text-neutral-700 text-center mt-2 font-sans italic line-clamp-1">
                  {currentBanner!.caption}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {alwaysOpen ? (
        <div className="px-5 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-sm shadow-primary/60" />
            <p className="card-font-display text-xl font-bold text-primary tracking-tight">AI Concierge</p>
          </div>
          <p className="text-[13.5px] text-muted-foreground/90 leading-relaxed font-medium">
            Ask me anything about AI literacy, strategy, or working together.
          </p>
        </div>
      ) : (
        <div className="px-5 pt-5 pb-4 border-b border-border/30 bg-card/60 backdrop-blur-sm flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Explore</p>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative flex items-center">
            <span className="absolute left-3.5 text-muted-foreground/50"><SearchIcon /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask me anything…"
              aria-label="AI Concierge search"
              className="w-full bg-secondary/50 border border-border/40 rounded-xl pl-10 pr-11 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
            <button
              type="submit"
              disabled={!query.trim() || loading}
              aria-label="Send"
              className="absolute right-2 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all"
            >
              {loading ? <SpinnerIcon /> : <ArrowIcon />}
            </button>
          </form>
        </div>
      )}

      {/* ── Content — scrollable ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
        <AnimatePresence mode="wait">

          {!activeQuery && (
            <motion.div key="suggestions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Welcome chat bubble — only in alwaysOpen mode */}
              {alwaysOpen && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary border border-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-bold text-primary">AI</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-2xl rounded-tl-sm bg-secondary/40 border border-border/30 px-4 py-3">
                      <p className="text-[14px] text-foreground/95 leading-relaxed font-medium">
                        Hi! I'm here to help you explore how AI literacy can create clarity, build capability, and drive real impact. What would you like to know?
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-1.5 ml-1 font-medium">{welcomeTime}</p>
                  </div>
                </div>
              )}

              <p className="text-[12px] text-muted-foreground uppercase tracking-widest font-bold pt-1">
                {alwaysOpen ? "Try asking about:" : "Suggested questions"}
              </p>
              <div className="space-y-2.5">
                {EXPLORE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="w-full text-left group flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-border/30 bg-secondary/20 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      {alwaysOpen && (
                        <span className="text-primary/80 text-lg font-light flex-shrink-0 leading-none">+</span>
                      )}
                      <span className="text-[14px] text-foreground/85 group-hover:text-foreground transition-colors truncate font-semibold">{s}</span>
                    </span>
                    <span className="text-muted-foreground/40 group-hover:text-primary/70 transition-colors flex-shrink-0"><ArrowIcon /></span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeQuery && loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 gap-3">
              <SpinnerIcon />
              <p className="text-sm text-muted-foreground">Thinking…</p>
            </motion.div>
          )}

          {activeQuery && !loading && answer && (
            <motion.div key="answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveQuery(null); setAnswer(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
                  Back
                </button>
              </div>
              <div className="rounded-xl bg-card border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">{activeQuery}</p>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
                  {feedbackStatus === "idle" && (
                    <>
                      <button type="button" onClick={() => handleRate("up")} aria-label="Rate response helpful" className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 -ml-1"><ThumbsUpIcon /></button>
                      <button type="button" onClick={() => handleRate("down")} aria-label="Rate response not helpful" className="text-muted-foreground/60 hover:text-foreground transition-colors p-1"><ThumbsDownIcon /></button>
                    </>
                  )}
                  {feedbackStatus === "pending-comment" && (
                    <div className="w-full flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-muted-foreground/60">
                        {feedbackRating === "up" ? <ThumbsUpIcon /> : <ThumbsDownIcon />}
                        <span className="text-[11px]">Thanks for the feedback.</span>
                      </div>
                      <textarea value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Anything we should know? (optional)" maxLength={2000} rows={2} className="w-full rounded-lg border border-border/30 bg-background/50 p-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <div className="flex justify-end">
                        <button type="button" onClick={handleSubmitComment} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/90 text-primary-foreground hover:bg-primary transition-colors">Send</button>
                      </div>
                    </div>
                  )}
                  {(feedbackStatus === "submitting" || feedbackStatus === "done") && (
                    <div className="flex items-center gap-1.5 text-muted-foreground/70"><CheckIcon /><span className="text-[11px]">Thanks for the feedback.</span></div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="Ask a follow-up…" className="flex-1 bg-secondary/50 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                <button onClick={() => handleSearch()} disabled={!query.trim()} aria-label="Send follow-up" className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"><ArrowIcon /></button>
              </div>
            </motion.div>
          )}

          {activeQuery && !loading && noContent && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <p className="text-sm text-muted-foreground">No results found for that query.</p>
              <button onClick={() => { setActiveQuery(null); setNoContent(false); }} className="text-xs text-primary hover:underline">Try another question</button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Persistent input at bottom — desktop alwaysOpen mode only ── */}
      {alwaysOpen && (
        <div className="px-5 pt-3 pb-4 border-t border-border/20 flex-shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative flex items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your question..."
              aria-label="Ask the AI Concierge"
              className="w-full bg-secondary/30 border border-border/40 rounded-xl pl-4 pr-12 py-3 text-[14px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
            <button
              type="submit"
              disabled={!query.trim() || loading}
              aria-label="Send"
              className="absolute right-1.5 w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/30"
            >
              {loading ? <SpinnerIcon /> : <ArrowIcon />}
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground/60 mt-2.5 text-center leading-relaxed font-medium">
            AI responses may vary. Please review important info.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExplorePanel;
