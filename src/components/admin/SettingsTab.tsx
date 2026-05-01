import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, SiteSettings, RobotDirective, CrawlerToggles } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Shield, Palette, Globe, Bot, Sun, Moon, Monitor, Zap, QrCode } from "lucide-react";
import { toast } from "sonner";
import { applyTheme } from "@/lib/theme";
import { ACCENT_COLORS } from "@/lib/constants";

interface SettingsTabProps {
  user: User;
}

/** Convert simple toggles \u2192 robots.txt directive array for storage. */
function togglesToDirectives(t: CrawlerToggles): RobotDirective[] {
  const directives: RobotDirective[] = [];

  // General crawlers (covers Google, Bing, and everything else)
  directives.push({
    userAgent: "*",
    rules: [{ action: t.searchEngines ? "allow" : "disallow", path: "/" }],
  });

  // Social media preview bots \u2014 only add explicit rules if different from the wildcard
  if (t.socialPreviews && !t.searchEngines) {
    directives.push(
      { userAgent: "Twitterbot", rules: [{ action: "allow", path: "/" }] },
      { userAgent: "facebookexternalhit", rules: [{ action: "allow", path: "/" }] },
    );
  } else if (!t.socialPreviews && t.searchEngines) {
    directives.push(
      { userAgent: "Twitterbot", rules: [{ action: "disallow", path: "/" }] },
      { userAgent: "facebookexternalhit", rules: [{ action: "disallow", path: "/" }] },
    );
  }

  // AI bots
  if (!t.aiBots) {
    directives.push(
      { userAgent: "GPTBot", rules: [{ action: "disallow", path: "/" }] },
      { userAgent: "ChatGPT-User", rules: [{ action: "disallow", path: "/" }] },
      { userAgent: "Claude-Web", rules: [{ action: "disallow", path: "/" }] },
      { userAgent: "Bytespider", rules: [{ action: "disallow", path: "/" }] },
      { userAgent: "CCBot", rules: [{ action: "disallow", path: "/" }] },
    );
  }

  return directives;
}

/** Convert stored directives back \u2192 simple toggles. */
function directivesToToggles(directives: RobotDirective[]): CrawlerToggles {
  const find = (ua: string) => directives.find((d) => d.userAgent === ua);
  const isAllowed = (d?: RobotDirective) => !d || d.rules.every((r) => r.action === "allow");

  const wildcard = find("*");
  const searchEngines = isAllowed(wildcard);

  const twitter = find("Twitterbot");
  const facebook = find("facebookexternalhit");
  // If explicit social bot rules exist, use those; otherwise inherit from wildcard
  const socialPreviews = twitter || facebook
    ? isAllowed(twitter) && isAllowed(facebook)
    : searchEngines;

  const gpt = find("GPTBot");
  const claude = find("Claude-Web");
  // If explicit AI bot rules exist, use those; otherwise inherit from wildcard
  const aiBots = gpt || claude
    ? isAllowed(gpt) && isAllowed(claude)
    : searchEngines;

  return { searchEngines, socialPreviews, aiBots };
}



const THEME_OPTIONS = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

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
  const [twitterHandle, setTwitterHandle] = useState("");
  const [crawlerToggles, setCrawlerToggles] = useState<CrawlerToggles>({
    searchEngines: true,
    socialPreviews: true,
    aiBots: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [aiQueryEnabled, setAiQueryEnabled] = useState(false);
  const [showQrScanLink, setShowQrScanLink] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    const [sitesRes, profileRes] = await Promise.all([
      db.from("sites").select("id, domain, share_usage_limit").eq("user_id", user.id).order("created_at", { ascending: false }),
      db.from("profiles").select("theme, accent_color, seo_title, seo_description, og_image_url, twitter_handle, robots_txt, ai_query_enabled, show_qr_scan_link").eq("user_id", user.id).maybeSingle(),
    ]);
    setSites((sitesRes.data as SiteSettings[]) || []);
    if (profileRes.data) {
      const p = profileRes.data as any;
      setTheme(p.theme || "dark");
      setAccentColor(p.accent_color || "amber");
      setSeoTitle(p.seo_title || "");
      setSeoDescription(p.seo_description || "");
      setOgImageUrl(p.og_image_url || "");
      setTwitterHandle(p.twitter_handle || "");
      if (Array.isArray(p.robots_txt) && p.robots_txt.length > 0) {
        setCrawlerToggles(directivesToToggles(p.robots_txt));
      }
      setAiQueryEnabled(!!p.ai_query_enabled);
      setShowQrScanLink(!!p.show_qr_scan_link);
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
        twitter_handle: twitterHandle,
        robots_txt: togglesToDirectives(crawlerToggles) as any,
        ai_query_enabled: aiQueryEnabled,
        show_qr_scan_link: showQrScanLink,
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

  // ── Crawler toggle helper ───────────────────────────────────────────────────
  const updateToggle = (key: keyof CrawlerToggles, val: boolean) => {
    setCrawlerToggles((prev) => ({ ...prev, [key]: val }));
  };

  const robotsTxtPreview = togglesToDirectives(crawlerToggles)
    .map((g) => {
      const lines = [`User-agent: ${g.userAgent}`];
      g.rules.forEach((r) => lines.push(`${r.action === "disallow" ? "Disallow" : "Allow"}: ${r.path}`));
      return lines.join("\n");
    })
    .join("\n\n");

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
            <Input id="seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Your Name \u2014 AI Business Card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-description">Meta Description</Label>
            <Textarea id="seo-description" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="A brief description of your card for search engines and social previews..." rows={3} />
            <p className="text-xs text-muted-foreground">{seoDescription.length}/160 characters recommended</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="og-image">OG Image URL</Label>
            <Input id="og-image" value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} placeholder="https://yoursite.com/og-card.png" />
            <p className="text-xs text-muted-foreground">Recommended 1200\u00d7630px. Used in Twitter/Facebook/LinkedIn link previews.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="twitter-handle">Twitter / X Handle</Label>
            <Input
              id="twitter-handle"
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="@yourhandle"
            />
            <p className="text-xs text-muted-foreground">Used for the Twitter Card \u201cvia\u201d attribution when your link is shared.</p>
          </div>
          {ogImageUrl && (
            <div className="rounded-lg overflow-hidden border border-border/30 max-w-xs">
              <img src={ogImageUrl} alt="OG image preview" className="w-full h-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Crawler Access (robots.txt) ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Bot className="w-4 h-4 text-primary" aria-hidden="true" /> Crawler Access
          </CardTitle>
          <CardDescription>Control which bots can visit your card. This generates your robots.txt file automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Search engines */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/20">
            <div className="space-y-1">
              <Label htmlFor="toggle-search" className="text-sm font-medium text-foreground">
                Allow search engines to index your card
              </Label>
              <p className="text-xs text-muted-foreground">
                Let Google, Bing, and other search engines find and list your card in search results.
              </p>
            </div>
            <Switch
              id="toggle-search"
              checked={crawlerToggles.searchEngines}
              onCheckedChange={(val) => updateToggle("searchEngines", val)}
            />
          </div>

          {/* Social previews */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/20">
            <div className="space-y-1">
              <Label htmlFor="toggle-social" className="text-sm font-medium text-foreground">
                Allow social media link previews
              </Label>
              <p className="text-xs text-muted-foreground">
                Let Twitter, Facebook, and LinkedIn generate a rich preview when someone shares your card link.
              </p>
            </div>
            <Switch
              id="toggle-social"
              checked={crawlerToggles.socialPreviews}
              onCheckedChange={(val) => updateToggle("socialPreviews", val)}
            />
          </div>

          {/* AI bots */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/20">
            <div className="space-y-1">
              <Label htmlFor="toggle-ai" className="text-sm font-medium text-foreground">
                Allow AI bots to read your content
              </Label>
              <p className="text-xs text-muted-foreground">
                Let ChatGPT, Claude, and other AI services access your card content for training or responses.
              </p>
            </div>
            <Switch
              id="toggle-ai"
              checked={crawlerToggles.aiBots}
              onCheckedChange={(val) => updateToggle("aiBots", val)}
            />
          </div>

          {/* Preview */}
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Preview generated robots.txt
            </summary>
            <pre className="mt-2 rounded-lg bg-black/40 p-3 text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">
              {robotsTxtPreview}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* ── Sharing & Visibility ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <Zap className="w-4 h-4 text-primary" aria-hidden="true" /> Sharing & Visibility
          </CardTitle>
          <CardDescription>Control cross-card AI queries and how visitors can share your card.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cross-card AI queries */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/20">
            <div className="space-y-1">
              <Label htmlFor="toggle-ai-query" className="text-sm font-medium text-foreground">
                Allow connected users to query my card via AI
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, people you're connected with can ask AI-powered questions about your public site content.
                Your data is never shared directly \u2014 only AI-generated answers are returned.
              </p>
            </div>
            <Switch
              id="toggle-ai-query"
              checked={aiQueryEnabled}
              onCheckedChange={setAiQueryEnabled}
            />
          </div>

          {/* QR scan link */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/20">
            <div className="space-y-1">
              <Label htmlFor="toggle-qr-scan" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                Show \u201cScan QR Code\u201d link on card
              </Label>
              <p className="text-xs text-muted-foreground">
                Displays a small QR code link at the bottom of your card so visitors can scan it with their phone.
              </p>
            </div>
            <Switch
              id="toggle-qr-scan"
              checked={showQrScanLink}
              onCheckedChange={setShowQrScanLink}
            />
          </div>
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
