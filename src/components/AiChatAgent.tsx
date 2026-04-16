import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient as db } from "@/lib/apiClient";
import type { ChatMessage } from "@/types";
import { QUICK_PROMPTS } from "@/lib/constants";

interface AiChatAgentProps {
  siteId?: string | null;
  initialMessage?: string | null;
  onMessageConsumed?: () => void;
}

// ── SVG icon primitives (no Lucide dependency) ────────────────────────────────
const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const BotIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" />
    <line x1="8" y1="15" x2="8" y2="17" />
    <line x1="16" y1="15" x2="16" y2="17" />
  </svg>
);

const StatusDot = () => (
  <span className="relative flex h-2 w-2" aria-hidden="true">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
  </span>
);

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="flex items-end gap-2"
  >
    <div className="w-7 h-7 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
      <BotIcon />
    </div>
    <div className="bg-card border border-border/40 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
      <div className="flex gap-1 items-center h-4">
        {[0, 0.18, 0.36].map((delay) => (
          <motion.span
            key={delay}
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 0.9, delay, ease: "easeInOut" }}
            className="w-1.5 h-1.5 rounded-full bg-primary/60"
          />
        ))}
      </div>
    </div>
  </motion.div>
);

// ── Message bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
          <BotIcon />
        </div>
      )}
      <div
        className={`max-w-[78%] text-sm leading-relaxed px-4 py-3 shadow-sm ${
          isUser
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
            : "bg-card border border-border/40 text-foreground rounded-2xl rounded-bl-sm"
        }`}
      >
        {msg.content.split("\n").map((line, j) => (
          <p key={j} className={j > 0 ? "mt-1.5" : ""}>
            {line.split(/(\*\*.*?\*\*)/).map((part, k) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={k} className="font-semibold">{part.slice(2, -2)}</strong>
              ) : (
                <span key={k}>{part}</span>
              )
            )}
          </p>
        ))}
      </div>
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const AiChatAgent = ({ siteId, initialMessage, onMessageConsumed }: AiChatAgentProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello. I'm the AI assistant for this card. Ask me about services, pricing, availability, or anything else you'd like to know.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (initialMessage) {
      handleSend(initialMessage);
      onMessageConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const handleSend = async (text?: string) => {
    if (isTyping) return;
    const message = text || input.trim();
    if (!message) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setIsTyping(true);

    try {
      const { data, error } = await db.functions.invoke("lemonade-chat", {
        body: {
          message,
          conversation_id: conversationId,
          ...(siteId ? { site_id: siteId } : {}),
        },
      });
      if (error) throw error;

      const result = data as { response?: string; conversation_id?: string };
      if (result.conversation_id) setConversationId(result.conversation_id);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.response || "No response received. Please try again.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Unable to connect at this moment. Please try again shortly.",
        },
      ]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background" style={{ minHeight: 440 }}>

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border/30 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <BotIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground tracking-tight">AI Assistant</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusDot />
              <span className="text-[11px] text-muted-foreground">Online</span>
            </div>
          </div>
        </div>

        {/* Quick prompts shown only before first user message */}
        {messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-wrap gap-1.5 mt-4"
          >
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-secondary/40 text-foreground/70 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all duration-200 font-medium"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {isTyping && <TypingIndicator key="typing" />}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-3 border-t border-border/30 bg-card/40 backdrop-blur-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question\u2026"
            aria-label="Chat input"
            disabled={isTyping}
            className="flex-1 bg-secondary/50 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            aria-label="Send message"
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
          >
            <SendIcon />
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground/40 text-center mt-2 tracking-wide">
          AI \u00b7 Responses may not be fully accurate
        </p>
      </div>

    </div>
  );
};

export default AiChatAgent;
