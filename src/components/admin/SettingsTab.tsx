import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Shield, Palette, Globe, Bot, Sun, Moon, Monitor, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { applyTheme } from "@/lib/theme";

interface SettingsTabProps {
  user: User;
}

interface SiteSettings {
  id: string;
  domain: string;
  share_usage_limit: number;
}

interface RobotDirective {
  userAgent: string;
  rules: { action: "allow" | "disallow"; path: string }[];
}

const ACCENT_COLORS = [
  { name: "amber", hsl: "38 95% 50%", bg: "bg-amber-500" },
  { name: "blue", hsl: "217 91% 60%", bg: "bg-blue-500" },
  { name: "green", hsl: "142 71% 45%", bg: "bg-green-600" },
  { name: "purple", hsl: "262 83% 58%", bg: "bg-purple-500" },
  { name: "rose", hsl: "347 77% 50%", bg: "bg-rose-500" },
  { name: "teal", hsl: "172 66% 50%", bg: "bg-teal-500" },
  { name: "orange", hsl: "25 95% 53%", bg: "bg-orange-500" },
  { name: "cyan", hsl: "189 94% 43%", bg: "bg-cyan-600" },
];

const THEME_OPTIONS = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

const USER_AGENTS = ["*", "Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit", "Slurp", "DuckDuckBot", "Baiduspider", "YandexBot"];

export default function SettingsTab({ user }: SettingsTabProps) {
  const [sites, setSites] = useState<SiteSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Profile-level settings
  const [theme, setTheme] = useState("dark");
  const [accentColor, setAccentColor] = useState("amber");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [robotsDirectives, setRobotsDirectives] = useState<RobotDirective[]>([
    { userAgent: "*", rules: [{ action: "allow", path: "/" }] },
  ]);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    const [sitesRes, profileRes] = await Promise.all([
      db.from("sites").select("id, domain, share_usage_limit").eq("user_id", user.id).order("created_at", { ascending: false }),
      db.from("profiles").select("theme, accent_color, seo_title, seo_description, og_image_url, robots_txt").eq("user_id", user.id).maybeSingle(),
    ]);
    setSites((sitesRes.data as SiteSettings[]) || []);
    if (profileRes.data) {
      const p = profileRes.data as any;
      setTheme(p.theme || "dark");
      setAccentColor(p.accent_color || "amber");
      setSeoTitle(p.seo_title || "");
      setSeoDescription(p.seo_description || "");
      setOgImageUrl(p.og_image_url || "");
      if (Array.isArray(p.robots_txt) && p.robots_txt.length > 0) {
        setRobotsDirectives(p.robots_txt);
      }
    }
    setLoading(false);
  };

  const handleUpdateLimit = async (siteId: string, limit: number) => {
    setSaving(siteId);
    const { error } = await db.from("sites").update({ share_usage_limit: limit }).eq("id", siteId);
    if (error) toast.error("Failed to update limit");
    else toast.success("Usage limit updated");
    setSaving(null);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await db
      .from("profiles")
      .update({
        theme,
        accent_color: accentColor,
        seo_title: seoTitle,
        seo_description: seoDescription,
        og_image_url: ogImageUrl,
        robots_txt: robotsDirectives as any,
      })
      .eq("user_id", user.id);

    if (error) toast.error("Failed to save settings");
    else {
      toast.success("Settings saved");
      // Apply theme + accent immediately
      applyTheme(theme, accentColor);
    }
    setSavingProfile(false);
  };

  // ── Robots helpers ─────────────────────────────────────────────────────────
  const addRobotGroup = () => {
    setRobotsDirectives([...robotsDirectives, { userAgent: "*", rules: [{ action: "allow", path: "/" }] }]);
  };
  const removeRobotGroup = (i: number) => {
    setRobotsDirectives(robotsDirectives.filter((_, idx) => idx !== i));
  };
  const updateRobotAgent = (i: number, agent: string) => {
    const d = [...robotsDirectives];
    d[i] = { ...d[i], userAgent: agent };
    setRobotsDirectives(d);
  };
  const addRobotRule = (groupIdx: number) => {
    const d = [...robotsDirectives];
    d[groupIdx] = { ...d[groupIdx], rules: [...d[groupIdx].rules, { action: "allow", path: "/" }] };
    setRobotsDirectives(d);
  };
  const removeRobotRule = (groupIdx: number, ruleIdx: number) => {
    const d = [...robotsDirectives];
    d[groupIdx] = { ...d[groupIdx], rules: d[groupIdx].rules.filter((_, i) => i !== ruleIdx) };
    setRobotsDirectives(d);
  };
  const updateRobotRule = (groupIdx: number, ruleIdx: number, field: "action" | "path", value: string) => {
    const d = [...robotsDirectives];
    const rules = [...d[groupIdx].rules];
    rules[ruleIdx] = { ...rules[ruleIdx], [field]: value };
    d[groupIdx] = { ...d[groupIdx], rules };
    setRobotsDirectives(d);
  };

  const robotsTxtPreview = robotsDirectives.map((g) => {
    const lines = [`User-agent: ${g.userAgent}`];
    g.rules.forEach((r) => lines.push(`${r.action === "disallow" ? "Disallow" : "Allow"}: ${r.path}`));
    return lines.join("\n");
  }).join("\n\n");

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
        <p className="text-sm text-muted-foreground">Configure theme, SEO, crawler rules, and sharing limits.</p>
      </div>

      {/* ── Theme & Accent Color ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Palette className="w-4 h-4 text-primary" aria-hidden="true" /> Theme & Accent Color
          </CardTitle>
          <CardDescription>Choose your card's appearance. The accent color is used for buttons, highlights, and glow effects.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Theme toggle */}
          <div className="space-y-2">
            <Label id="theme-label">Theme</Label>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="theme-label">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${theme === opt.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/30 bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                    }`}
                >
                  <opt.icon className="w-4 h-4" aria-hidden="true" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accent color picker */}
          <div className="space-y-2">
            <Label id="accent-label">Accent Color</Label>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-labelledby="accent-label">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  role="radio"
                  aria-checked={accentColor === color.name}
                  aria-label={color.name}
                  onClick={() => setAccentColor(color.name)}
                  className={`w-10 h-10 rounded-full ${color.bg} transition-all ${accentColor === color.name
                      ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                      : "opacity-60 hover:opacity-100"
                    }`}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SEO / Open Graph ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Globe className="w-4 h-4 text-primary" aria-hidden="true" /> SEO / Open Graph
          </CardTitle>
          <CardDescription>Control how your card appears in search results and link previews on social media.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seo-title">Page Title</Label>
            <Input id="seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Your Name — AI Business Card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-description">Meta Description</Label>
            <Textarea id="seo-description" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="A brief description of your card for search engines and social previews..." rows={3} />
            <p className="text-xs text-muted-foreground">{seoDescription.length}/160 characters recommended</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="og-image">OG Image URL</Label>
            <Input id="og-image" value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} placeholder="https://yoursite.com/og-card.png" />
            <p className="text-xs text-muted-foreground">Recommended 1200×630px. Used in Twitter/Facebook/LinkedIn link previews.</p>
          </div>
          {ogImageUrl && (
            <div className="rounded-lg overflow-hidden border border-border/30 max-w-xs">
              <img src={ogImageUrl} alt="OG image preview" className="w-full h-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── robots.txt Editor ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Bot className="w-4 h-4 text-primary" aria-hidden="true" /> robots.txt
          </CardTitle>
          <CardDescription>Control which search engine crawlers can access your card. Each group targets a specific bot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {robotsDirectives.map((group, gi) => (
            <div key={gi} className="rounded-lg border border-border/20 bg-secondary/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`robot-agent-${gi}`} className="text-xs shrink-0">User-agent</Label>
                <select
                  id={`robot-agent-${gi}`}
                  value={group.userAgent}
                  onChange={(e) => updateRobotAgent(gi, e.target.value)}
                  className="h-8 rounded-md border border-border/30 bg-secondary/60 px-2 text-sm text-foreground flex-1"
                  aria-label={`User agent for group ${gi + 1}`}
                >
                  {USER_AGENTS.map((ua) => (
                    <option key={ua} value={ua}>{ua}</option>
                  ))}
                </select>
                {robotsDirectives.length > 1 && (
                  <button type="button" onClick={() => removeRobotGroup(gi)} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${group.userAgent} group`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {group.rules.map((rule, ri) => (
                <div key={ri} className="flex items-center gap-2 pl-4">
                  <select
                    value={rule.action}
                    onChange={(e) => updateRobotRule(gi, ri, "action", e.target.value)}
                    className="h-8 rounded-md border border-border/30 bg-secondary/60 px-2 text-xs text-foreground w-24"
                    aria-label={`Action for rule ${ri + 1} of ${group.userAgent}`}
                  >
                    <option value="allow">Allow</option>
                    <option value="disallow">Disallow</option>
                  </select>
                  <Input
                    value={rule.path}
                    onChange={(e) => updateRobotRule(gi, ri, "path", e.target.value)}
                    className="h-8 text-xs bg-secondary/60 border-border/30 flex-1"
                    placeholder="/path"
                    aria-label={`Path for rule ${ri + 1} of ${group.userAgent}`}
                  />
                  {group.rules.length > 1 && (
                    <button type="button" onClick={() => removeRobotRule(gi, ri)} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove rule ${ri + 1}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addRobotRule(gi)} className="text-xs h-7 ml-4">
                <Plus className="w-3 h-3 mr-1" /> Add Rule
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRobotGroup} className="w-full">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add User-Agent Group
          </Button>

          {/* Preview */}
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Preview rendered robots.txt
            </summary>
            <pre className="mt-2 rounded-lg bg-black/40 p-3 text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">
              {robotsTxtPreview}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* ── Share Usage Limits ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Shield className="w-4 h-4 text-primary" aria-hidden="true" /> Share Usage Limits
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
                  <Label htmlFor={`limit-${site.id}`} className="text-xs text-muted-foreground">{site.domain}</Label>
                  <Input
                    id={`limit-${site.id}`}
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
                  aria-label={`Save limit for ${site.domain}`}
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

      {/* Save all profile-level settings */}
      <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full sm:w-auto">
        <Save className="w-4 h-4 mr-1" /> {savingProfile ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
