import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, CreditCard, Globe } from "lucide-react";

type ReceivedCard = {
  id: string;
  sender_name: string;
  sender_domain: string;
  sender_avatar: string;
  sender_tagline: string;
  notes: string;
  usage_count: number;
  usage_limit: number;
  created_at: string;
};

interface ReceivedCardsTabProps {
  user: User;
}

const ReceivedCardsTab = ({ user }: ReceivedCardsTabProps) => {
  const [cards, setCards] = useState<ReceivedCard[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    const { data } = await db
      .from("received_cards")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setCards((data as ReceivedCard[]) || []);
  };

  const deleteCard = async (cardId: string) => {
    await db.from("received_cards").delete().eq("id", cardId);
    fetchCards();
    toast({ title: "Card removed" });
  };

  const usagePercent = (card: ReceivedCard) =>
    card.usage_limit > 0 ? Math.min((card.usage_count / card.usage_limit) * 100, 100) : 0;

  const isExpired = (card: ReceivedCard) => card.usage_count >= card.usage_limit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" /> Received Cards
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Business cards shared with you. Up to 20 cards max. Each card has a usage limit set by the sender.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{cards.length}/20</span>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-border/20 bg-card/20 p-8 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No cards received yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            When someone shares their business card with you, it will appear here as a visual embed.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`relative rounded-2xl border p-5 transition-all ${isExpired(card)
                ? "border-destructive/30 bg-destructive/5 opacity-60"
                : "border-border/30 bg-gradient-card glow-amber-sm hover:glow-amber"
                }`}
            >
              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive h-7 w-7"
                onClick={() => deleteCard(card.id)}
                aria-label={`Delete card from ${card.sender_name}`}
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </Button>

              {/* Avatar */}
              <div className="flex items-center gap-3 mb-3">
                {card.sender_avatar ? (
                  <img
                    src={card.sender_avatar}
                    alt={card.sender_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-primary/30"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {card.sender_name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{card.sender_name}</p>
                  {card.sender_domain && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Globe className="w-3 h-3 shrink-0" /> {card.sender_domain}
                    </p>
                  )}
                </div>
              </div>

              {/* Tagline */}
              {card.sender_tagline && (
                <p className="text-xs text-muted-foreground italic mb-3 line-clamp-2">
                  "{card.sender_tagline}"
                </p>
              )}

              {/* Usage bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={isExpired(card) ? "text-destructive" : "text-muted-foreground"}>
                    {isExpired(card) ? "Limit reached" : `Uses: ${card.usage_count}/${card.usage_limit}`}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden" role="progressbar" aria-valuenow={card.usage_count} aria-valuemin={0} aria-valuemax={card.usage_limit} aria-label={`Usage: ${card.usage_count} of ${card.usage_limit}`}>
                  <div
                    className={`h-full rounded-full transition-all ${isExpired(card) ? "bg-destructive" : "bg-primary"
                      }`}
                    style={{ width: `${usagePercent(card)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReceivedCardsTab;
