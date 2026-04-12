import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Sparkles } from "lucide-react";
import { apiClient as db } from "@/lib/apiClient";
import type { ChatMessage } from "@/types";
import { QUICK_PROMPTS } from "@/lib/constants";

interface AiChatAgentProps {
  initialMessage?: string | null;
  onMessageConsumed?: () => void;
}

const AiChatAgent = ({ initialMessage, onMessageConsumed }: AiChatAgentProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hey! ✨ I'm Watts, your AI guide. Ask me anything about our services, pricing, or how we help social workers harness AI ethically.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle pre-filled messages from service cards
  useEffect(() => {
    if (initialMessage) {
      handleSend(initialMessage);
      onMessageConsumed?.();
    }
  }, [initialMessage]);

  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message) return;

    const userMsg: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const { data, error } = await db.functions.invoke("lemonade-chat", {
        body: { message, conversation_id: conversationId },
      });

      if (error) throw error;

      const result = data as { response?: string; conversation_id?: string };
      if (result.conversation_id) {
        setConversationId(result.conversation_id);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response || "Sorry, I couldn't get a response. Please try again." },
      ]);
    } catch (err) {
      console.error("Lemonade chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm having trouble connecting right now. Please try again in a moment." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 420 }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">
              Ask <span className="text-gradient-amber">Watts</span>
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-muted-foreground">Always online</span>
            </div>
          </div>
        </div>

        {/* Quick prompts */}
        {messages.length <= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-1.5 mt-3"
          >
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/20 text-primary/80 hover:bg-primary/10 hover:text-primary transition-all duration-200 font-medium"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] text-sm leading-relaxed ${msg.role === "assistant"
                  ? "bg-secondary/70 backdrop-blur-sm text-secondary-foreground rounded-2xl rounded-tl-md px-4 py-3 border border-border/30"
                  : "bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3 glow-amber-sm"
                  }`}
              >
                {msg.content.split("\n").map((line, j) => (
                  <p key={j} className={j > 0 ? "mt-1" : ""}>
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
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start">
            <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mr-2">
              <Sparkles className="w-3 h-3 text-primary animate-pulse" />
            </div>
            <div className="bg-secondary/70 rounded-2xl rounded-tl-md px-4 py-3 border border-border/30">
              <div className="flex gap-1 items-center">
                {[0, 0.15, 0.3].map((delay) => (
                  <motion.span
                    key={delay}
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ repeat: Infinity, duration: 0.7, delay }}
                    className="w-1.5 h-1.5 rounded-full bg-primary/50"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex items-center"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="w-full bg-secondary/60 rounded-2xl pl-4 pr-12 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 border border-border/30 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiChatAgent;
