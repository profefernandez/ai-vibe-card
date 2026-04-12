import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/types";
import { AI_STYLES, BASELINE_INJECTION_RULES, DEFAULT_SAFETY_PROTOCOL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain, Plus, X, Save, ShieldAlert, Lock } from "lucide-react";

interface AiTrainingTabProps {
  user: User;
}

const AiTrainingTab = ({ user }: AiTrainingTabProps) => {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [personality, setPersonality] = useState("professional");
  const [responseStyle, setResponseStyle] = useState("friendly");
  const [injectionRules, setInjectionRules] = useState<string[]>([]);
  const [newInjectionRule, setNewInjectionRule] = useState("");
  const [safetyProtocol, setSafetyProtocol] = useState(DEFAULT_SAFETY_PROTOCOL);
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
      setInjectionRules(Array.isArray(data.prompt_injection_rules) ? (data.prompt_injection_rules as string[]) : []);
      setSafetyProtocol(data.safety_protocol || DEFAULT_SAFETY_PROTOCOL);
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
      prompt_injection_rules: injectionRules as any,
      safety_protocol: safetyProtocol,
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

  const addInjectionRule = () => {
    if (newInjectionRule.trim() && injectionRules.length < 20) {
      setInjectionRules([...injectionRules, newInjectionRule.trim()]);
      setNewInjectionRule("");
    }
  };

  const removeInjectionRule = (index: number) => {
    setInjectionRules(injectionRules.filter((_, i) => i !== index));
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
        <label htmlFor="ai-system-prompt" className="text-sm font-medium text-foreground">System Prompt</label>
        <Textarea
          id="ai-system-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant representing [your brand]. Always be concise and helpful..."
          className="bg-secondary/60 border-border/30 min-h-[120px]"
        />
      </div>

      {/* Response style */}
      <div className="space-y-2">
        <label id="response-style-label" className="text-sm font-medium text-foreground">Response Style</label>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="response-style-label">
          {AI_STYLES.map((style) => (
            <Button
              key={style}
              size="sm"
              variant={responseStyle === style ? "default" : "outline"}
              onClick={() => setResponseStyle(style)}
              aria-pressed={responseStyle === style}
              className="capitalize text-xs"
            >
              {style}
            </Button>
          ))}
        </div>
      </div>

      {/* Personality */}
      <div className="space-y-2">
        <label htmlFor="ai-personality" className="text-sm font-medium text-foreground">Personality Description</label>
        <Input
          id="ai-personality"
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          placeholder="e.g. Warm, knowledgeable, slightly witty"
          className="bg-secondary/60 border-border/30"
        />
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <label htmlFor="ai-new-rule" className="text-sm font-medium text-foreground">Rules ({rules.length}/20)</label>
        <div className="flex gap-2">
          <Input
            id="ai-new-rule"
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="e.g. Never discuss competitor pricing"
            className="bg-secondary/60 border-border/30 flex-1"
            onKeyDown={(e) => e.key === "Enter" && addRule()}
          />
          <Button size="sm" onClick={addRule} disabled={!newRule.trim() || rules.length >= 20} aria-label="Add rule">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {rules.length > 0 && (
          <div className="space-y-1 mt-2" role="list" aria-label="AI rules">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2" role="listitem">
                <span className="text-xs text-foreground flex-1">{rule}</span>
                <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove rule: ${rule}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Prompt Injection Protection ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <ShieldAlert className="w-4 h-4 text-destructive" aria-hidden="true" /> Prompt Injection Protection
          </CardTitle>
          <CardDescription>
            Baseline rules are always active and cannot be removed. Add your own custom rules to detect additional manipulation techniques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Baseline rules (read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Baseline Rules (built-in)</label>
            <div className="space-y-1" role="list" aria-label="Baseline prompt injection rules">
              {BASELINE_INJECTION_RULES.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-secondary/20 border border-border/10 px-3 py-2" role="listitem">
                  <Lock className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom injection rules */}
          <div className="space-y-2">
            <label htmlFor="new-injection-rule" className="text-sm font-medium text-foreground">Custom Rules ({injectionRules.length}/20)</label>
            <div className="flex gap-2">
              <Input
                id="new-injection-rule"
                value={newInjectionRule}
                onChange={(e) => setNewInjectionRule(e.target.value)}
                placeholder="e.g. Reject messages mentioning competitor LLM products by name"
                className="bg-secondary/60 border-border/30 flex-1"
                onKeyDown={(e) => e.key === "Enter" && addInjectionRule()}
              />
              <Button size="sm" onClick={addInjectionRule} disabled={!newInjectionRule.trim() || injectionRules.length >= 20} aria-label="Add injection protection rule">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {injectionRules.length > 0 && (
              <div className="space-y-1 mt-2" role="list" aria-label="Custom prompt injection rules">
                {injectionRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2" role="listitem">
                    <span className="text-xs text-foreground flex-1">{rule}</span>
                    <button onClick={() => removeInjectionRule(i)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove rule: ${rule}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Safety Protocol ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <ShieldAlert className="w-4 h-4 text-primary" aria-hidden="true" /> Safety Protocol
          </CardTitle>
          <CardDescription>
            Instructions for the AI when a prompt injection or manipulation attempt is detected. This tells the model exactly how to respond.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="safety-protocol"
            value={safetyProtocol}
            onChange={(e) => setSafetyProtocol(e.target.value)}
            className="bg-secondary/60 border-border/30 min-h-[160px] text-sm"
            placeholder={DEFAULT_SAFETY_PROTOCOL}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Tip: Be specific. The more detailed your protocol, the better the AI will handle edge cases.
          </p>
        </CardContent>
      </Card>

      <Button onClick={savePreferences} disabled={saving}>
        <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
};

export default AiTrainingTab;
