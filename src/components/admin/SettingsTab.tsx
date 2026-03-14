import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Settings, Shield } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

interface SettingsTabProps {
  user: User;
}

interface SiteSettings {
  id: string;
  domain: string;
  share_usage_limit: number;
}

export default function SettingsTab({ user }: SettingsTabProps) {
  const [sites, setSites] = useState<SiteSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchSites();
  }, [user]);

  const fetchSites = async () => {
    const { data } = await supabase
      .from("sites")
      .select("id, domain, share_usage_limit")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSites((data as SiteSettings[]) || []);
    setLoading(false);
  };

  const handleUpdateLimit = async (siteId: string, limit: number) => {
    setSaving(siteId);
    const { error } = await supabase
      .from("sites")
      .update({ share_usage_limit: limit })
      .eq("id", siteId);

    if (error) {
      toast.error("Failed to update limit");
    } else {
      toast.success("Usage limit updated");
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-sans">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure general preferences and sharing limits.</p>
      </div>

      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Shield className="w-4 h-4 text-primary" /> Share Usage Limits
          </CardTitle>
          <CardDescription>
            Control how many times each shared card can be queried. This protects your API key from overuse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sites imported yet. Import a site first.</p>
          ) : (
            sites.map((site) => (
              <div key={site.id} className="flex items-end gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">{site.domain}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={site.share_usage_limit}
                    onChange={(e) =>
                      setSites(sites.map((s) =>
                        s.id === site.id ? { ...s, share_usage_limit: parseInt(e.target.value) || 1 } : s
                      ))
                    }
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleUpdateLimit(site.id, site.share_usage_limit)}
                  disabled={saving === site.id}
                >
                  {saving === site.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
