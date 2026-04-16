import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db } from "@/lib/apiClient";
import { EXPLORE_SUGGESTIONS } from "@/lib/constants";
import ReactMarkdown from "react-markdown";

interface ExplorePanelProps {
  siteId?: string | null;
  onSearch?: (query: string) => void;
  onClose?: () => void;
}

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

const ExplorePanel = ({ siteId, onSearch, onClose }: ExplorePanelProps) => {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noContent, setNoContent] = useState(false);

  const handleSearch = async (text?: string) => {
    const searchText = text || query.trim();
    if (!searchText) return;

    setActiveQuery(searchText);
    setQuery("");
    setLoading(true);
    setNoContent(false);
    setAnswer(null);
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

      const result = data as { response?: string; conversation_id?: string };
      if (result.conversation_id) setConversationId(result.conversation_id);

      if (result.response) {
        setAnswer(result.response);
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

          {/* Suggestions state */}
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

          {/* Loading state */}
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

          {/* Answer state */}
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
              </div>
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

          {/* No content state */}
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
