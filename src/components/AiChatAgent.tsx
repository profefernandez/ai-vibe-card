import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, X, Bot, User } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const BUSINESS_CONTEXT = `You are the AI assistant for "60 Watts of Clarity," a social work AI consulting business founded by Tanya Williams. 

Key facts:
- No-code AI agent training for social work professionals
- Built on the Learn AI Literacy → Build AI Agents → Deploy AI Agents framework
- Grounded in the NASW Code of Ethics and 90+ research sources
- Services: AI Literacy Workshop ($497/session), AI Agent Build ($1,997 one-time), Team Training ($3,497/cohort), VIP Strategy Day ($4,997/day)
- Contact: hello@60wattsofclarity.com
- Booking: Free discovery calls available via Calendly
- Social work professionals can learn to build AI agents without coding

Be friendly, professional, and concise. Answer questions about services, pricing, and the business. If you don't know something specific, suggest booking a discovery call.`;

const getAiResponse = (userMessage: string): string => {
  const msg = userMessage.toLowerCase();

  if (msg.includes("price") || msg.includes("cost") || msg.includes("how much")) {
    return "Here are our service tiers:\n\n• **AI Literacy Workshop** — $497/session\n• **AI Agent Build** — $1,997 (one-time)\n• **Team Training** — $3,497/cohort\n• **VIP Strategy Day** — $4,997/day\n\nWould you like to book a free discovery call to discuss which option fits best?";
  }
  if (msg.includes("service") || msg.includes("offer") || msg.includes("what do you")) {
    return "We offer four core services:\n\n1. **AI Literacy Workshop** — Learn the foundations of AI for social work\n2. **AI Agent Build** — Get a custom no-code AI agent built for your practice\n3. **Team Training** — A 6-week cohort program for organizations\n4. **VIP Strategy Day** — Full-day intensive planning session\n\nAll grounded in the NASW Code of Ethics. Want to learn more about any specific service?";
  }
  if (msg.includes("book") || msg.includes("call") || msg.includes("meeting") || msg.includes("schedule")) {
    return "You can book a **free discovery call** right from this card! Just tap the gold 'Book a Free Discovery Call' button above. We'd love to chat about how AI can transform your social work practice. 📅";
  }
  if (msg.includes("contact") || msg.includes("email") || msg.includes("phone") || msg.includes("reach")) {
    return "You can reach us at:\n\n📧 **hello@60wattsofclarity.com**\n📱 Via the social links on this card\n📅 Or book a free discovery call directly!\n\nWe typically respond within 24 hours.";
  }
  if (msg.includes("who") || msg.includes("tanya") || msg.includes("founder") || msg.includes("about")) {
    return "**Tanya Williams** is the founder of 60 Watts of Clarity. She specializes in no-code AI agent training for social work professionals, helping them leverage AI tools ethically and effectively. Her framework — Learn AI Literacy → Build AI Agents → Deploy AI Agents — is grounded in the NASW Code of Ethics and backed by 90+ research sources.";
  }
  if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
    return "Hey there! 👋 Welcome to 60 Watts of Clarity. I'm here to help you learn about our AI consulting services for social work professionals. What would you like to know?";
  }

  return "Great question! For the most detailed answer, I'd recommend booking a **free discovery call** with Tanya. She can walk you through exactly how 60 Watts of Clarity can help your practice. In the meantime, feel free to ask me about our services, pricing, or how to get started!";
};

const AiChatAgent = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! 👋 I'm the 60 Watts AI assistant. Ask me anything about our services, pricing, or how we can help your social work practice!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const response = getAiResponse(userMsg.content);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      setIsTyping(false);
    }, 800 + Math.random() * 700);
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg glow-amber animate-pulse-glow z-50"
            aria-label="Open AI chat"
          >
            <MessageCircle className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-x-3 bottom-3 top-16 z-50 flex flex-col rounded-2xl bg-card border border-border overflow-hidden shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:top-auto sm:w-[380px] sm:h-[520px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">AI Assistant</p>
                  <p className="text-[10px] text-muted-foreground">60 Watts of Clarity</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.role === "assistant" ? "bg-primary/20" : "bg-secondary"
                  }`}>
                    {msg.role === "assistant" ? (
                      <Bot className="w-3 h-3 text-primary" />
                    ) : (
                      <User className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "assistant"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {msg.content.split("\n").map((line, j) => (
                      <p key={j} className={j > 0 ? "mt-1" : ""}>
                        {line.split(/(\*\*.*?\*\*)/).map((part, k) =>
                          part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={k}>{part.slice(2, -2)}</strong>
                          ) : (
                            <span key={k}>{part}</span>
                          )
                        )}
                      </p>
                    ))}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                  <div className="bg-secondary rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about services, pricing..."
                  className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AiChatAgent;
