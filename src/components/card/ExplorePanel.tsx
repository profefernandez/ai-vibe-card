import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db, type KbImage } from "@/lib/apiClient";
import { EXPLORE_SUGGESTIONS } from "@/lib/constants";
import ReactMarkdown from "react-markdown";

interface ExplorePanelProps {
  siteId?: string | null;
  profileId?: string | null;
  assistantAvatarUrl?: string | null;
  onSearch?: (query: string) => void;
  onClose?: () => void;
  onAnswer?: () => void;
  hideBanner?: boolean;
  alwaysOpen?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type FeedbackRating = "up" | "down";
type FeedbackStatus = "idle" | "pending-comment" | "submitting" | "done";

// ── SVG icons — all aria-hidden, accessible names live on parent buttons ──────
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const SpinnerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true" focusable="false">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
const ThumbsUpIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L15 2a3.13 3.13 0 0 1 0 3.88Z" />
  </svg>
);
const ThumbsDownIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L9 22a3.13 3.13 0 0 1 0-3.88Z" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const BackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <polyline points="15 18 9 12 15 6" />
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
  } catch { /* fire-and-forget */ }
}

const ExplorePanel = ({
  siteId, profileId, assistantAvatarUrl, onSearch, onClose, onAnswer,
  hideBanner = false, alwaysOpen = false,
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
  const [kbImages, setKbImages] = useState<KbImage[]>([]);
  const [kbIndex, setKbIndex] = useState(0);

  // AAA: Refs for focus management
  const chatInputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileId) return;
    void db.kbImages.listPublic(profileId).then(({ data }) => setKbImages(data));
  }, [profileId]);

  useEffect(() => {
    if (!answer || kbImages.length === 0) return;
    setKbIndex((i) => (i + 1) % kbImages.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  // AAA: Move focus to answer region when response arrives
  useEffect(() => {
    if (answer && answerRef.current) {
      setTimeout(() => answerRef.current?.focus(), 150);
    }
  }, [answer]);

  const currentBanner = kbImages.length > 0 ? kbImages[kbIndex % kbImages.length] : null;
  const showBanner = !hideBanner && !alwaysOpen && currentBanner;

  useEffect(() => {
    setFeedbackStatus("idle");
    setFeedbackRating(null);
    setFeedbackComment("");
  }, [activeQuery, answer]);

  const handleRate = (rating: FeedbackRating) => {
    if (feedbackStatus !== "idle" || !feedbackToken) return;
    setFeedbackRating(rating);
    if (rating === "up") {
      setFeedbackStatus("done");
      void postFeedback({ profile_id: boundProfileId ?? profileId ?? null, rating, question_text: activeQuery ?? undefined, answer_text: answer ?? undefined, conversation_id: conversationId, feedback_token: feedbackToken });
    } else {
      setFeedbackStatus("pending-comment");
    }
  };

  const handleSubmitComment = () => {
    if (!feedbackRating || !feedbackToken) { setFeedbackStatus("done"); return; }
    setFeedbackStatus("submitting");
    void postFeedback({ profile_id: boundProfileId ?? profileId ?? null, rating: feedbackRating, comment: feedbackComment.trim().slice(0, 2000) || undefined, question_text: activeQuery ?? undefined, answer_text: answer ?? undefined, conversation_id: conversationId, feedback_token: feedbackToken });
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
        body: { message: searchText, conversation_id: conversationId, ...(siteId ? { site_id: siteId } : {}) },
      });
      if (error) throw error;
      const result = data as { response?: string; conversation_id?: string; feedback_token?: string; profile_id?: string };
      if (result.conversation_id) setConversationId(result.conversation_id);
      setFeedbackToken(result.feedback_token ?? null);
      setBoundProfileId(result.profile_id ?? null);
      if (result.response) { setAnswer(result.response); onAnswer?.(); }
      else setNoContent(true);
    } catch { setNoContent(true); }
    finally { setLoading(false); }
  };

  const panelClasses = alwaysOpen ? "flex flex-col h-full min-h-0" : "flex flex-col h-full bg-background";

  return (
    <div className={panelClasses}>

      {/* ── AAA: Skip link to chat input (keyboard/screen reader users) ── */}
      {alwaysOpen && (
        <a
          href="#ai-chat-input"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-xs focus:font-semibold"
          onClick={(e) => { e.preventDefault(); chatInputRef.current?.focus(); }}
        >
          Skip to chat input
        </a>
      )}

      {/* ── Polaroid banner ── */}
      {showBanner && (
        <div className="px-6 pt-6 pb-2 flex flex-col items-center">
          <div className="relative w-full max-w-sm">
            <div className="bg-white p-3 pb-5 rounded-md shadow-lg shadow-black/30 rotate-[-0.5deg]">
              <AnimatePresence mode="wait">
                <motion.img key={currentBanner!.id} src={currentBanner!.url} alt={currentBanner!.caption || "Gallery image"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} className="w-full aspect-[4/3] object-cover rounded-sm" />
              </AnimatePresence>
              {currentBanner!.caption && <p className="text-xs text-neutral-700 text-center mt-2 font-sans italic line-clamp-1">{currentBanner!.caption}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      {alwaysOpen ? (
        <div className="px-5 pt-5 pb-4 flex-shrink-0 border-b border-primary/12 bg-gradient-to-b from-primary/8 to-transparent">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">AI Concierge</span>
          </div>
          <p className="text-[13px] text-muted-foreground/90 leading-relaxed font-medium max-w-[28ch]">
            Ask me anything about AI literacy, strategy, or working together.
          </p>
        </div>
      ) : (
        <div className="px-5 pt-5 pb-4 border-b border-primary/12 bg-gradient-to-b from-primary/6 to-transparent flex-shrink-0">
          <p className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] mb-3">Explore</p>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} role="search" aria-label="Ask the AI Concierge">
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-muted-foreground/50 pointer-events-none" aria-hidden="true"><SearchIcon /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask me anything…"
                aria-label="Ask the AI Concierge"
                className="w-full bg-secondary/40 border border-border/40 rounded-2xl pl-10 pr-12 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background focus:border-primary/50 transition-all"
              />
              <button
                type="submit"
                disabled={!query.trim() || loading}
                aria-label="Send question to AI Concierge"
                className="absolute right-1.5 min-w-[36px] min-h-[36px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-md shadow-primary/30"
              >
                {loading ? <SpinnerIcon /> : <ArrowIcon />}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── AAA: ARIA live region — screen readers announce new answers ── */}
      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
        aria-label="AI Concierge conversation"
        className="flex-1 overflow-y-auto px-5 py-3 min-h-0"
      >
        {/* AAA: Loading status for screen readers */}
        {loading && (
          <div role="status" aria-live="polite" className="sr-only">
            AI Concierge is thinking, please wait.
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ── Suggestions / Welcome ── */}
          {!activeQuery && (
            <motion.div key="suggestions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {alwaysOpen && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/60 border border-primary/20 overflow-hidden flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-black/20" aria-hidden="true">
                    {assistantAvatarUrl ? (
                      <img src={assistantAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-bold text-primary">AI</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-2xl rounded-tl-sm bg-card/60 border border-primary/12 px-4 py-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                      <p className="text-[14px] text-foreground/95 leading-relaxed font-medium">
                        Hi! I'm here to help you explore how AI literacy can create clarity, build capability, and drive real impact. What would you like to know?
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-1.5 ml-1 font-medium" aria-hidden="true">10:42</p>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold pt-1">
                {alwaysOpen ? "Try asking about:" : "Suggested questions"}
              </p>
              <div className="space-y-2" role="list" aria-label="Suggested questions">
                {EXPLORE_SUGGESTIONS.map((s) => (
                  <div key={s} role="listitem">
                    <button
                      onClick={() => handleSearch(s)}
                      className="w-full text-left group flex items-center justify-between gap-2 px-4 py-3.5 rounded-2xl border border-border/25 bg-card/30 hover:bg-primary/8 hover:border-primary/30 hover:-translate-y-[1px] transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                      aria-label={`Ask: ${s}`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        {alwaysOpen && (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary/80 text-sm font-light flex-shrink-0 leading-none" aria-hidden="true">+</span>
                        )}
                        <span className="text-[13.5px] text-foreground/85 group-hover:text-foreground transition-colors truncate font-semibold">{s}</span>
                      </span>
                      <span className="text-muted-foreground/40 group-hover:text-primary/70 transition-colors flex-shrink-0" aria-hidden="true"><ArrowIcon /></span>
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Loading ── */}
          {activeQuery && loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 gap-3" aria-hidden="true">
              <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground/70 font-medium">Thinking…</p>
            </motion.div>
          )}

          {/* ── Answer ── */}
          {activeQuery && !loading && answer && (
            <motion.div key="answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <button
                onClick={() => { setActiveQuery(null); setAnswer(null); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded px-1 min-h-[44px]"
                aria-label="Back to suggested questions"
              >
                <BackIcon />
                Back
              </button>

              {/* AAA: Answer card is focusable — keyboard/screen reader users land here after response */}
              <div
                ref={answerRef}
                tabIndex={-1}
                className="rounded-2xl bg-card/60 border border-primary/12 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="AI Concierge response"
              >
                <p className="text-[11px] text-primary/80 mb-3 font-semibold uppercase tracking-[0.15em] truncate">{activeQuery}</p>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/92 leading-relaxed [&>p]:mb-3 [&>ul]:mb-3 [&>ol]:mb-3">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>

                {/* AAA: Feedback — 44px minimum targets */}
                <div className="mt-4 pt-3 border-t border-border/20 flex items-center gap-1">
                  {feedbackStatus === "idle" && (
                    <>
                      <span className="text-[11px] text-muted-foreground/60 mr-2 font-medium">Helpful?</span>
                      <button
                        type="button"
                        onClick={() => handleRate("up")}
                        aria-label="Rate this response as helpful"
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <ThumbsUpIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRate("down")}
                        aria-label="Rate this response as not helpful"
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <ThumbsDownIcon />
                      </button>
                    </>
                  )}
                  {feedbackStatus === "pending-comment" && (
                    <div className="w-full flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground/70 font-medium">Thanks — anything specific we should improve?</p>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Optional feedback…"
                        maxLength={2000}
                        rows={2}
                        aria-label="Optional feedback comment"
                        className="w-full rounded-xl border border-border/30 bg-background/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSubmitComment}
                          className="text-[12px] px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                          aria-label="Submit feedback"
                        >
                          Send feedback
                        </button>
                      </div>
                    </div>
                  )}
                  {(feedbackStatus === "submitting" || feedbackStatus === "done") && (
                    <div className="flex items-center gap-2 text-primary/80">
                      <CheckIcon />
                      <span className="text-[11px] font-medium">Thanks for the feedback.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Follow-up input */}
              <div className="flex gap-2">
                <label htmlFor="followup-input" className="sr-only">Ask a follow-up question</label>
                <input
                  id="followup-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Ask a follow-up…"
                  className="flex-1 bg-secondary/40 border border-border/40 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-all"
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={!query.trim()}
                  aria-label="Send follow-up question"
                  className="min-w-[44px] min-h-[44px] rounded-2xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-md shadow-primary/30"
                >
                  <ArrowIcon />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── No content ── */}
          {activeQuery && !loading && noContent && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 gap-4 text-center" role="status">
              <div className="w-12 h-12 rounded-full bg-secondary/40 border border-border/30 flex items-center justify-center" aria-hidden="true">
                <SearchIcon />
              </div>
              <p className="text-sm text-muted-foreground font-medium">No results found for that query.</p>
              <button
                onClick={() => { setActiveQuery(null); setNoContent(false); }}
                className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded px-2 py-1 min-h-[44px]"
                aria-label="Clear search and try another question"
              >
                Try another question
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Persistent bottom input — desktop alwaysOpen mode ── */}
      {alwaysOpen && (
        <div className="px-5 pt-3 pb-5 border-t border-primary/12 flex-shrink-0 bg-gradient-to-t from-black/15 to-transparent">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            role="search"
            aria-label="Chat with AI Concierge"
            className="relative flex items-center"
          >
            <label htmlFor="ai-chat-input" className="sr-only">Type your question for the AI Concierge</label>
            <input
              id="ai-chat-input"
              ref={chatInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your question..."
              className="w-full bg-secondary/30 border border-border/40 rounded-2xl pl-4 pr-14 py-3.5 text-[14px] font-medium text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background focus:border-primary/40 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            />
            <button
              type="submit"
              disabled={!query.trim() || loading}
              aria-label="Send message to AI Concierge"
              className="absolute right-1.5 min-w-[44px] min-h-[44px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-md shadow-primary/30"
            >
              {loading ? <SpinnerIcon /> : <ArrowIcon />}
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground/50 mt-2.5 text-center leading-relaxed font-medium">
            AI responses may vary. Please review important info.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExplorePanel;
