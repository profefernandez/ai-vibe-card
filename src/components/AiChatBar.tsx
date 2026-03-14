import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, X, ChevronDown } from "lucide-react";
import AiChatAgent from "./AiChatAgent";

export interface AiChatBarHandle {
  focusInput: () => void;
  sendMessage: (msg: string) => void;
}

const AiChatBar = forwardRef<AiChatBarHandle>((_, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (!isExpanded) {
        inputRef.current?.focus();
      } else {
        // already expanded
      }
    },
    sendMessage: (msg: string) => {
      setPendingMessage(msg);
      setIsExpanded(true);
    },
  }));

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setPendingMessage(quickInput.trim());
    setQuickInput("");
    setIsExpanded(true);
  };

  const handleBarClick = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  return (
    <>
      {/* Persistent bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-md mx-auto">
          <AnimatePresence>
            {!isExpanded && (
              <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="mx-3 mb-3"
              >
                <form
                  onSubmit={handleQuickSubmit}
                  onClick={handleBarClick}
                  className="relative flex items-center bg-card/95 backdrop-blur-xl rounded-2xl border border-primary/20 glow-amber-sm overflow-hidden"
                >
                  <div className="pl-4 pr-2 py-3 flex items-center gap-2 flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <input
                    ref={inputRef}
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="Ask Watts anything..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 py-3 pr-2 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!quickInput.trim()}
                    className="mr-2 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Expanded chat panel */}
      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 h-[85vh] max-w-md mx-auto bg-gradient-card rounded-t-3xl border border-border/50 border-b-0 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-1">
                <div className="w-10 h-1 rounded-full bg-border/60 mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                <div />
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <AiChatAgent initialMessage={pendingMessage} onMessageConsumed={() => setPendingMessage(null)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

AiChatBar.displayName = "AiChatBar";

export default AiChatBar;
