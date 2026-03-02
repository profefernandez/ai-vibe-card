import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Sparkles } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const getAiResponse = (userMessage: string): string => {
  const msg = userMessage.toLowerCase();

  if (msg.includes("price") || msg.includes("cost") || msg.includes("how much")) {
    return "Here are our service tiers:\n\n• **AI Literacy Workshop** — $497/session\n• **AI Agent Build** — $1,997 (one-time)\n• **Team Training** — $3,497/cohort\n• **VIP Strategy Day** — $4,997/day\n\nWould you like to book a free discovery call to discuss which option fits best?";
  }
  if (msg.includes("service") || msg.includes("offer") || msg.includes("what do you")) {
    return "We offer four core services:\n\n1. **AI Literacy Workshop** — Learn the foundations of AI for social work\n2. **AI Agent Build** — Get a custom no-code AI agent built for your practice\n3. **Team Training** — A 6-week cohort program for organizations\n4. **VIP Strategy Day** — Full-day intensive planning session\n\nAll grounded in the NASW Code of Ethics. Want to learn more about any specific service?";
  }
  if (msg.includes("book") || msg.includes("call") || msg.includes("meeting") || msg.includes("schedule")) {
    return "You can book a **free discovery call** by tapping the gold button at the top of the page. We'd love to chat about how AI can transform your social work practice. 📅";
  }
  if (msg.includes("contact") || msg.includes("email") || msg.includes("phone") || msg.includes("reach")) {
    return "You can reach us at:\n\n📧 **hello@60wattsofclarity.com**\n📱 Via the social links above\n📅 Or book a free discovery call directly!\n\nWe typically respond within 24 hours.";
  }
  if (msg.includes("who") || msg.includes("tanya") || msg.includes("founder") || msg.includes("about")) {
    return "**Tanya Williams** is the founder of 60 Watts of Clarity. She specializes in no-code AI agent training for social work professionals, helping them leverage AI tools ethically and effectively. Her framework — Learn AI Literacy → Build AI Agents → Deploy AI Agents — is grounded in the NASW Code of Ethics and backed by 90+ research sources.";
  }
  if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
    return "Hey there! 👋 Welcome to 60 Watts of Clarity. I'm here to help you learn about our AI consulting services for social work professionals. What would you like to know?";
  }

  return "Great question! For the most detailed answer, I'd recommend booking a **free discovery call** with Tanya. She can walk you through exactly how 60 Watts of Clarity can help your practice. In the meantime, feel free to ask me about our services, pricing, or how to get started!";
};

const QUICK_PROMPTS = [
  "What services do you offer?",
  "How much does it cost?",
  "Tell me about Tanya",
  "How do I book a call?",
];

const AiChatAgent = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey! ✨ I'm Watts, your AI guide. Ask me anything about our services, pricing, or how we help social workers harness AI ethically.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const message = text || input.trim();
    if (!message) return;

    const userMsg: Message = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const response = getAiResponse(userMsg.content);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      setIsTyping(false);
    }, 600 + Math.random() * 600);
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
                className={`max-w-[80%] text-sm leading-relaxed ${
                  msg.role === "assistant"
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
