import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, ApiConnection } from "@/types";
import { API_PROVIDERS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Plug, Eye, EyeOff } from "lucide-react";

interface ApiConnectorTabProps {
  user: User;
}

const ApiConnectorTab = ({ user }: ApiConnectorTabProps) => {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  // For Lemonade rows, model_name *is* the agent ID — column is reused.
  // For OpenAI/Anthropic/Google, this stays as a real model name.
  const [modelInputs, setModelInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    const { data } = await db
      .from("api_connections")
      .select("*")
      .eq("user_id", user.id);
    setConnections((data as ApiConnection[]) || []);
  };

  const getConnection = (provider: string) =>
    connections.find((c) => c.provider === provider);

  const saveConnection = async (providerId: string, defaultModel: string) => {
    const key = keyInputs[providerId]?.trim();
    const existing = getConnection(providerId);
    // Lemonade requires the user's own Agent ID; other providers fall back to defaultModel.
    const modelOrAgent =
      modelInputs[providerId]?.trim() || existing?.model_name || defaultModel;

    if (providerId === "lemonade" && (!modelOrAgent || modelOrAgent === "default")) {
      toast({
        title: "Agent ID required",
        description: "Paste the Agent ID from your Launch Lemonade dashboard.",
        variant: "destructive",
      });
      return;
    }
    // Allow saving Agent ID alone (no new key) when the user already has a key on file.
    if (!key && !existing) return;

    if (existing) {
      await db
        .from("api_connections")
        .update({
          ...(key ? { api_key_encrypted: key } : {}),
          model_name: modelOrAgent,
        })
        .eq("id", existing.id);
    } else {
      await db.from("api_connections").insert({
        user_id: user.id,
        provider: providerId,
        api_key_encrypted: key,
        model_name: modelOrAgent,
        is_active: false,
      });
    }
    setKeyInputs({ ...keyInputs, [providerId]: "" });
    setModelInputs({ ...modelInputs, [providerId]: "" });
    fetchConnections();
    toast({ title: "Saved" });
  };

  const toggleActive = async (providerId: string) => {
    // Deactivate all, then activate this one
    for (const conn of connections) {
      if (conn.is_active) {
        await db.from("api_connections").update({ is_active: false }).eq("id", conn.id);
      }
    }
    const conn = getConnection(providerId);
    if (conn) {
      await db.from("api_connections").update({ is_active: true }).eq("id", conn.id);
    }
    fetchConnections();
    toast({ title: `${providerId} set as active provider` });
  };

  const testConnection = async (providerId: string) => {
    const conn = getConnection(providerId);
    if (!conn) return;
    setTesting(providerId);
    try {
      const { data, error } = await db.functions.invoke("test-api-connection", {
        body: { provider: providerId },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "Connection successful", description: `${providerId} API key is valid.` });
      } else {
        toast({ title: "Connection failed", description: data?.error || "Invalid key", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Plug className="w-5 h-5 text-primary" /> API Connector
      </h2>
      <p className="text-sm text-muted-foreground">
        Connect AI model providers. Only one can be active at a time.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {API_PROVIDERS.map((provider) => {
          const conn = getConnection(provider.id);
          const hasKey = !!conn?.api_key_encrypted;
          return (
            <div
              key={provider.id}
              className={`rounded-xl border p-4 space-y-3 transition-all ${conn?.is_active
                ? "border-primary/50 bg-primary/5"
                : "border-border/30 bg-card/30"
                }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{provider.label}</h3>
                {hasKey ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
                    <span className="sr-only">Connected</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-muted-foreground/40" aria-hidden="true" />
                    <span className="sr-only">Not connected</span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <label
                    htmlFor={`api-key-${provider.id}`}
                    className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1"
                  >
                    API key
                  </label>
                  <div className="relative">
                    <Input
                      id={`api-key-${provider.id}`}
                      type={showKey[provider.id] ? "text" : "password"}
                      placeholder={hasKey ? "•••••••• (already saved)" : "Paste API key"}
                      value={keyInputs[provider.id] || ""}
                      onChange={(e) => setKeyInputs({ ...keyInputs, [provider.id]: e.target.value })}
                      className="bg-secondary/60 border-border/30 text-xs pr-8"
                      aria-label={`API key for ${provider.label}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey({ ...showKey, [provider.id]: !showKey[provider.id] })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showKey[provider.id] ? `Hide ${provider.label} API key` : `Show ${provider.label} API key`}
                    >
                      {showKey[provider.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`api-model-${provider.id}`}
                    className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1"
                  >
                    {provider.id === "lemonade" ? "Agent ID" : "Model"}
                  </label>
                  <Input
                    id={`api-model-${provider.id}`}
                    type="text"
                    placeholder={
                      provider.id === "lemonade"
                        ? "e.g. 1776043025280x542737663275827200"
                        : provider.defaultModel
                    }
                    value={modelInputs[provider.id] ?? (conn?.model_name && conn.model_name !== "default" ? conn.model_name : "")}
                    onChange={(e) => setModelInputs({ ...modelInputs, [provider.id]: e.target.value })}
                    className="bg-secondary/60 border-border/30 text-xs font-mono"
                    aria-label={`${provider.id === "lemonade" ? "Agent ID" : "Model"} for ${provider.label}`}
                  />
                  {provider.id === "lemonade" && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Each user's chat is powered by their own Lemonade agent — find the ID in your LL dashboard.
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => saveConnection(provider.id, provider.defaultModel)}
                    disabled={!keyInputs[provider.id]?.trim() && !modelInputs[provider.id]?.trim()}
                    aria-label={`Save ${provider.label} settings`}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {hasKey && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={conn?.is_active ? "default" : "outline"}
                    onClick={() => toggleActive(provider.id)}
                    aria-pressed={conn?.is_active}
                    className="text-xs"
                  >
                    {conn?.is_active ? "Active" : "Set Active"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => testConnection(provider.id)}
                    disabled={testing === provider.id}
                    aria-label={`Test ${provider.label} connection`}
                    className="text-xs"
                  >
                    {testing === provider.id ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" aria-hidden="true" />
                    ) : null}
                    Test
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ApiConnectorTab;
