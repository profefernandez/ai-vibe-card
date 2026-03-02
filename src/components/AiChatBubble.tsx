import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import AiChatAgent from "./AiChatAgent";

const AiChatBubble = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating trigger */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center glow-amber hover:scale-110 active:scale-95 transition-transform"
        initial={{ scale: 0 }}
        animate={{ scale: isOpen ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 300 }}
        aria-label="Open AI Chat"
      >
        <MessageCircle className="w-6 h-6" />
      </motion.button>

      {/* Floating label */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ delay: 1.5 }}
            className="fixed bottom-8 right-[5.5rem] z-50 bg-card border border-border/50 rounded-xl px-3 py-1.5 pointer-events-none"
          >
            <span className="text-xs text-foreground font-medium">Ask Watts AI ✨</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            />

            {/* Chat panel */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 h-[85vh] max-w-md mx-auto bg-gradient-card rounded-t-3xl border border-border/50 border-b-0 overflow-hidden flex flex-col"
            >
              {/* Close handle */}
              <div className="flex items-center justify-between px-5 pt-4 pb-1">
                <div className="w-10 h-1 rounded-full bg-border/60 mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                <div />
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <AiChatAgent />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AiChatBubble;
