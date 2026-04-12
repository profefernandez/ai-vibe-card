import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Brain, Plus, X, Save } from "lucide-react";

const STYLES = ["friendly", "professional", "casual", "formal"];

interface AiTrainingTabProps {
  user: User;
}

const AiTrainingTab = ({ user }: AiTrainingTabProps) => {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [personality, setPersonality] = useState("professional");
  const [responseStyle, setResponseStyle] = useState("friendly");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    const { data } = await db
      .from("ai_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setSystemPrompt(data.system_prompt || "");
      setRules(Array.isArray(data.rules) ? (data.rules as string[]) : []);
      setPersonality(data.personality || "professional");
      setResponseStyle(data.response_style || "friendly");
    }
    setLoaded(true);
  };

  const savePreferences = async () => {
    setSaving(true);
    const payload = {
      user_id: user.id,
      system_prompt: systemPrompt,
      rules: rules as any,
      personality,
      response_style: responseStyle,
      updated_at: new Date().toISOString(),
    };

    // Upsert
    const { data: existing } = await db
      .from("ai_preferences")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await db.from("ai_preferences").update(payload).eq("id", existing.id);
    } else {
      await db.from("ai_preferences").insert(payload);
    }

    setSaving(false);
    toast({ title: "AI preferences saved" });
  };

  const addRule = () => {
    if (newRule.trim() && rules.length < 20) {
      setRules([...rules, newRule.trim()]);
      setNewRule("");
    }
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary" /> AI Training
      </h2>
      <p className="text-sm text-muted-foreground">
        Define how the AI behaves when responding to visitor queries on your card.
      </p>

      {/* System prompt */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">System Prompt</label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant representing [your brand]. Always be concise and helpful..."
          className="bg-secondary/60 border-border/30 min-h-[120px]"
        />
      </div>

      {/* Response style */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Response Style</label>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((style) => (
            <Button
              key={style}
              size="sm"
              variant={responseStyle === style ? "default" : "outline"}
              onClick={() => setResponseStyle(style)}
              className="capitalize text-xs"
            >
              {style}
            </Button>
          ))}
        </div>
      </div>

      {/* Personality */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Personality Description</label>
        <Input
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          placeholder="e.g. Warm, knowledgeable, slightly witty"
          className="bg-secondary/60 border-border/30"
        />
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Rules ({rules.length}/20)</label>
        <div className="flex gap-2">
          <Input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="e.g. Never discuss competitor pricing"
            className="bg-secondary/60 border-border/30 flex-1"
            onKeyDown={(e) => e.key === "Enter" && addRule()}
          />
          <Button size="sm" onClick={addRule} disabled={!newRule.trim() || rules.length >= 20}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {rules.length > 0 && (
          <div className="space-y-1 mt-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2">
                <span className="text-xs text-foreground flex-1">{rule}</span>
                <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={savePreferences} disabled={saving}>
        <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
};

export default AiTrainingTab;
