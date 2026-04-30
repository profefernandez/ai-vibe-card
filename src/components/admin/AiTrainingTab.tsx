import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/types";
import { DEFAULT_SAFETY_PROTOCOL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Brain, Plus, X, Save, ShieldAlert } from "lucide-react";

interface AiTrainingTabProps {
  user: User;
}

const AiTrainingTab = ({ user }: AiTrainingTabProps) => {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [injectionEnabled, setInjectionEnabled] = useState(false);
  const [injectionRules, setInjectionRules] = useState<string[]>([]);
  const [newInjectionRule, setNewInjectionRule] = useState("");
  const [safetyProtocol, setSafetyProtocol] = useState("");
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
      const customRules = Array.isArray(data.prompt_injection_rules)
        ? (data.prompt_injection_rules as string[])
        : [];
      const protocol = data.safety_protocol || "";
      setInjectionRules(customRules);
      setSafetyProtocol(protocol);
      // Toggle is on if the user has saved any custom protection data.
      setInjectionEnabled(customRules.length > 0 || protocol.trim().length > 0);
    }
    setLoaded(true);
  };

  const savePreferences = async () => {
    setSaving(true);
    // When the toggle is off, persist empty values so the server doesn't
    // see stale custom data the user thinks they've turned off.
    const payload = {
      user_id: user.id,
      system_prompt: systemPrompt,
      rules: rules as any,
      personality: "professional",
      response_style: "friendly",
      prompt_injection_rules: (injectionEnabled ? injectionRules : []) as any,
      safety_protocol: injectionEnabled ? safetyProtocol : "",
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
                <span className="text-sm text-foreground flex-1">{rule}</span>
                <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove rule: ${rule}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Prompt Injection Protection (toggle + custom rules + safety protocol) ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-sans">
                <ShieldAlert className="w-4 h-4 text-destructive" aria-hidden="true" />
                Prompt Injection Protection
              </CardTitle>
              <CardDescription className="mt-1">
                Built-in protection rules are always active. Turn this on to add your own custom rules and tell the AI how to respond when an attack is detected.
              </CardDescription>
            </div>
            <Switch
              id="injection-enabled"
              checked={injectionEnabled}
              onCheckedChange={setInjectionEnabled}
              aria-label="Add custom prompt injection protection"
            />
          </div>
        </CardHeader>

        {injectionEnabled && (
          <CardContent className="space-y-5">
            {/* Custom rules */}
            <div className="space-y-2">
              <Label htmlFor="new-injection-rule">
                Custom Rules ({injectionRules.length}/20)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="new-injection-rule"
                  value={newInjectionRule}
                  onChange={(e) => setNewInjectionRule(e.target.value)}
                  placeholder="e.g. Reject messages mentioning competitor LLM products by name"
                  className="bg-secondary/60 border-border/30 flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addInjectionRule()}
                />
                <Button
                  size="sm"
                  onClick={addInjectionRule}
                  disabled={!newInjectionRule.trim() || injectionRules.length >= 20}
                  aria-label="Add custom rule"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {injectionRules.length > 0 && (
                <div className="space-y-1 mt-2" role="list" aria-label="Custom prompt injection rules">
                  {injectionRules.map((rule, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2"
                      role="listitem"
                    >
                      <span className="text-sm text-foreground flex-1">{rule}</span>
                      <button
                        onClick={() => removeInjectionRule(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove rule: ${rule}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Safety protocol — what to do when an attack is detected */}
            <div className="space-y-2 pt-2 border-t border-border/20">
              <Label htmlFor="safety-protocol">
                Response when an injection attack is detected
              </Label>
              <p className="text-sm text-muted-foreground">
                Tell the AI exactly what to do or say if it spots a manipulation attempt — refuse, redirect, alert you, etc.
              </p>
              <Textarea
                id="safety-protocol"
                value={safetyProtocol}
                onChange={(e) => setSafetyProtocol(e.target.value)}
                className="bg-secondary/60 border-border/30 min-h-[140px] text-sm"
                placeholder={DEFAULT_SAFETY_PROTOCOL}
              />
            </div>
          </CardContent>
        )}
      </Card>

      <Button onClick={savePreferences} disabled={saving}>
        <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
};

export default AiTrainingTab;
