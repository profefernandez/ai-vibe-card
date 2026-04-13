import { useState } from "react";
import type { Connection, ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    Globe, ExternalLink, Zap, Loader2, Send,
    Check, X, Trash2, MessageSquare,
} from "lucide-react";

interface MiniCardProps {
    connection: Connection;
    userId: string;
    onAction: (id: string, action: "approved" | "declined" | "delete") => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getAuthHeaders(): Record<string, string> {
    try {
        const session = JSON.parse(localStorage.getItem("vps_session") || "null");
        return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    } catch { return {}; }
}

export default function MiniCard({ connection: c, userId, onAction }: MiniCardProps) {
    const isOwner = c.owner_id === userId;
    const isPending = c.status === "pending";
    const isApproved = c.status === "approved";
    const { toast } = useToast();

    // AI query state
    const [showChat, setShowChat] = useState(false);
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [querying, setQuerying] = useState(false);

    const handleQuery = async () => {
        if (!query.trim() || querying) return;
        const userMsg = query.trim();
        setQuery("");
        setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
        setQuerying(true);
        try {
            const res = await fetch(`${API_BASE}/connections/${c.id}/query`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify({ question: userMsg }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
            } else {
                toast({ title: data.error || "Query failed", variant: "destructive" });
            }
        } catch {
            toast({ title: "Network error", variant: "destructive" });
        } finally {
            setQuerying(false);
        }
    };

    return (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm overflow-hidden flex flex-col">
            {/* Card header with avatar + identity */}
            <div className="p-5 text-center space-y-3">
                {c.avatar_url ? (
                    <img
                        src={c.avatar_url}
                        alt={c.display_name || ""}
                        className="w-16 h-16 rounded-full mx-auto object-cover border-2 border-primary/20"
                    />
                ) : (
                    <div className="w-16 h-16 rounded-full mx-auto bg-primary/20 flex items-center justify-center">
                        <span className="text-xl font-bold text-primary">
                            {c.display_name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                        {c.display_name || "Unknown"}
                    </p>
                    {c.tagline && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{c.tagline}</p>
                    )}
                </div>
            </div>

            {/* Status badge + message */}
            {isPending && c.message && (
                <div className="px-5 pb-2">
                    <p className="text-xs text-muted-foreground italic line-clamp-2">"{c.message}"</p>
                </div>
            )}

            {/* Actions bar */}
            <div className="mt-auto border-t border-border/10 px-4 py-3 flex items-center gap-2 flex-wrap">
                {isPending && isOwner && (
                    <>
                        <Button size="sm" variant="default" onClick={() => onAction(c.id, "approved")}>
                            <Check className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAction(c.id, "declined")}>
                            <X className="w-3 h-3 mr-1" /> Decline
                        </Button>
                    </>
                )}
                {isApproved && c.slug && (
                    <a
                        href={`/card/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                        <Globe className="w-3 h-3" /> View Card
                    </a>
                )}
                {isApproved && c.cta_url && (
                    <a
                        href={c.cta_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ExternalLink className="w-3 h-3" /> {c.cta_label || "Contact"}
                    </a>
                )}
                {isApproved && c.ai_query_enabled && (
                    <Button
                        size="sm"
                        variant={showChat ? "secondary" : "outline"}
                        onClick={() => setShowChat(!showChat)}
                        className="ml-auto"
                    >
                        <Zap className="w-3 h-3 mr-1" /> Ask AI
                    </Button>
                )}
                <div className="flex-1" />
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onAction(c.id, "delete")}
                    aria-label="Remove connection"
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>

            {/* AI Chat panel */}
            {showChat && (
                <div className="border-t border-border/10 bg-background/30 p-4 space-y-3">
                    {messages.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center">
                            Ask a question about {c.display_name}'s card content
                        </p>
                    )}
                    {messages.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-2">
                            {messages.map((m, i) => (
                                <div
                                    key={i}
                                    className={`text-xs rounded-lg px-3 py-2 ${m.role === "user"
                                            ? "bg-primary/10 text-foreground ml-6"
                                            : "bg-secondary/30 text-foreground mr-6"
                                        }`}
                                >
                                    {m.content}
                                </div>
                            ))}
                            {querying && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                            placeholder="Ask something..."
                            className="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border/20 focus:border-primary/50"
                            disabled={querying}
                        />
                        <Button size="icon" onClick={handleQuery} disabled={querying || !query.trim()}>
                            <Send className="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
