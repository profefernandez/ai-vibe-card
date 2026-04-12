import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { apiClient as db } from "@/lib/apiClient";
import ReactMarkdown from "react-markdown";

interface ExplorePanelProps {
  onSearch?: (query: string) => void;
  onClose?: () => void;
}

const SUGGESTIONS = [
  "What services do you offer?",
  "Tell me about Tanya",
  "How much does it cost?",
  "How can AI help social workers?",
];

const ExplorePanel = ({ onSearch, onClose }: ExplorePanelProps) => {
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
        body: { message: searchText, conversation_id: conversationId },
      });

      if (error) throw error;

      const result = data as { response?: string; conversation_id?: string };
      if (result.conversation_id) {
        setConversationId(result.conversation_id);
      }
      if (result.response) {
        setAnswer(result.response);
      } else {
        setNoContent(true);
      }
    } catch (err) {
      console.error("Query error:", err);
      setNoContent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">
            Explore <span className="text-gradient-amber">Watts</span>
          </h2>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about 60 Watts..."
            className="w-full bg-secondary/60 rounded-2xl pl-11 pr-12 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 border border-border/30 transition-all"
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-20 transition-all hover:scale-105 active:scale-95"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <AnimatePresence mode="wait">
          {!activeQuery ? (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Try asking</p>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="w-full text-left group flex items-center justify-between px-4 py-3 rounded-xl border border-border/30 bg-secondary/30 hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
                  >
                    <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">{s}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-border/20">
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                  Powered by AI · Grounded in the NASW Code of Ethics
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-4"
            >
              <button
                onClick={() => {
                  setActiveQuery(null);
                  setAnswer(null);
                  setNoContent(false);
                  onClose?.();
                }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                aria-label="Return to the business card"
              >
                ← Back to card
              </button>

              <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">You asked</p>
                  <p className="text-sm font-medium text-foreground">{activeQuery}</p>
                </div>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15, duration: 0.3 }}
                      className="h-20 rounded-xl bg-secondary/40 border border-border/20 animate-pulse"
                    />
                  ))}
                </div>
              ) : noContent ? (
                <div className="rounded-2xl border border-border/30 bg-secondary/20 p-6 text-center">
                  <p className="text-sm text-muted-foreground">I couldn't get a response right now. Please try again in a moment.</p>
                </div>
              ) : answer ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-border/30 bg-secondary/20 p-5"
                >
                  <div className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{answer}</ReactMarkdown>
                  </div>
                </motion.div>
              ) : null}

              {/* Follow-up input */}
              {!loading && (answer || noContent) && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                  className="relative mt-4"
                >
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a follow-up..."
                    className="w-full bg-secondary/60 rounded-2xl pl-11 pr-12 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 border border-border/30 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-20 transition-all hover:scale-105 active:scale-95"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ExplorePanel;
