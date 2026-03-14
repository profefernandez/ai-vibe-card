import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Send, Sparkles } from "lucide-react";

export interface AiChatBarHandle {
  focusInput: () => void;
  sendMessage: (msg: string) => void;
}

interface AiChatBarProps {
  inline?: boolean;
  onSubmit?: (message: string) => void;
}

const AiChatBar = forwardRef<AiChatBarHandle, AiChatBarProps>(({ inline, onSubmit }, ref) => {
  const [quickInput, setQuickInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
    },
    sendMessage: (msg: string) => {
      onSubmit?.(msg);
    },
  }));

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onSubmit?.(quickInput.trim());
    setQuickInput("");
  };

  const inputBar = (
    <form
      onSubmit={handleQuickSubmit}
      className="flex items-center bg-background/50 border-t border-border/30 overflow-hidden"
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
        className="mr-3 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );

  if (!inline) return null;

  return inputBar;
});

AiChatBar.displayName = "AiChatBar";

export default AiChatBar;
