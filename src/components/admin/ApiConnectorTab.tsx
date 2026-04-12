import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Plug, Eye, EyeOff } from "lucide-react";

type ApiConnection = {
  id: string;
  provider: string;
  api_key_encrypted: string;
  model_name: string;
  is_active: boolean;
};

const PROVIDERS = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o" },
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-3-sonnet" },
  { id: "google", label: "Google Gemini", defaultModel: "gemini-pro" },
  { id: "lemonade", label: "Launch Lemonade", defaultModel: "default" },
];

interface ApiConnectorTabProps {
  user: User;
}

const ApiConnectorTab = ({ user }: ApiConnectorTabProps) => {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
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
    if (!key) return;

    const existing = getConnection(providerId);
    if (existing) {
      await db
        .from("api_connections")
        .update({ api_key_encrypted: key, model_name: defaultModel })
        .eq("id", existing.id);
    } else {
      await db.from("api_connections").insert({
        user_id: user.id,
        provider: providerId,
        api_key_encrypted: key,
        model_name: defaultModel,
        is_active: false,
      });
    }
    setKeyInputs({ ...keyInputs, [providerId]: "" });
    fetchConnections();
    toast({ title: "API key saved" });
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
        body: { provider: providerId, api_key: conn.api_key_encrypted },
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
        {PROVIDERS.map((provider) => {
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
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey[provider.id] ? "text" : "password"}
                    placeholder={hasKey ? "••••••••" : "Enter API key"}
                    value={keyInputs[provider.id] || ""}
                    onChange={(e) => setKeyInputs({ ...keyInputs, [provider.id]: e.target.value })}
                    className="bg-secondary/60 border-border/30 text-xs pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey({ ...showKey, [provider.id]: !showKey[provider.id] })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey[provider.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => saveConnection(provider.id, provider.defaultModel)}
                  disabled={!keyInputs[provider.id]?.trim()}
                >
                  Save
                </Button>
              </div>

              {hasKey && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={conn?.is_active ? "default" : "outline"}
                    onClick={() => toggleActive(provider.id)}
                    className="text-xs"
                  >
                    {conn?.is_active ? "Active" : "Set Active"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => testConnection(provider.id)}
                    disabled={testing === provider.id}
                    className="text-xs"
                  >
                    {testing === provider.id ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
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
