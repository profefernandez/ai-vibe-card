import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, ArrowRight, ArrowLeft, Loader2, Globe, PenLine, SkipForward,
  Copy, Check, ExternalLink, Settings as SettingsIcon,
} from "lucide-react";

/**
 * First-visit onboarding wizard. 5 steps.
 * Rendered in place of the normal admin when profiles.display_name is empty.
 * On completion, calls onDone() which refetches the profile and drops the
 * user into the regular admin UI.
 */

interface OnboardingWizardProps {
  user: User;
  onDone: () => void;
}

type GroundingPath = "site" | "bio" | "skip";
type Tone = "warm" | "professional" | "direct";

const TONE_LABELS: Record<Tone, { label: string; desc: string }> = {
  warm: { label: "Warm", desc: "Friendly, empathetic, personable" },
  professional: { label: "Professional", desc: "Polished, clear, measured" },
  direct: { label: "Direct", desc: "Concise, practical, to-the-point" },
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function OnboardingWizard({ user, onDone }: OnboardingWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 2
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");

  // Step 3
  const [grounding, setGrounding] = useState<GroundingPath>("bio");
  const [siteUrl, setSiteUrl] = useState("");
  const [bio, setBio] = useState("");

  // Step 4
  const [tone, setTone] = useState<Tone>("warm");
  const [avoidText, setAvoidText] = useState("");

  // Step 5 (final)
  const [slug, setSlug] = useState("");
  const [copied, setCopied] = useState(false);
  const cardUrl = slug ? `${window.location.origin}/card/${slug}` : "";

  const focusRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);

  // Focus the first interactive element when a step mounts
  useEffect(() => {
    const t = setTimeout(() => focusRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

  const goNext = useCallback(() => setStep((s) => Math.min(5, s + 1)), []);
  const goBack = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  // ── Step 2 save: display_name + tagline ────────────────────────────────────
  const saveBasicInfo = async (): Promise<boolean> => {
    if (!displayName.trim() || !tagline.trim()) {
      toast({ title: "Please fill in both fields", variant: "destructive" });
      return false;
    }
    setSaving(true);
    const { error } = await db
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          display_name: displayName.trim(),
          tagline: tagline.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save — please try again", variant: "destructive" });
      return false;
    }
    return true;
  };

  // ── Step 3 save: grounding ────────────────────────────────────────────────
  const saveGrounding = async (): Promise<boolean> => {
    setSaving(true);
    try {
      if (grounding === "site" && siteUrl.trim()) {
        // Normalize — Firecrawl-backed scrape flow lives in SiteImportTab and
        // requires domain verification first, so we don't auto-trigger it here.
        // We just save the domain into the `sites` table so the user can verify
        // and scrape from the Site Import tab whenever they're ready.
        const domain = siteUrl.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
        const { error } = await db
          .from("sites")
          .insert({ domain, name: domain, user_id: user.id });
        if (error) {
          toast({ title: "Couldn't save site — skipping for now", variant: "destructive" });
        } else {
          toast({
            title: "Site saved",
            description: "Verify & scrape it later from the Site Import tab.",
          });
        }
      } else if (grounding === "bio" && bio.trim()) {
        const { error } = await db
          .from("profiles")
          .upsert(
            { user_id: user.id, bio: bio.trim(), updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        if (error) {
          toast({ title: "Couldn't save bio", variant: "destructive" });
          return false;
        }
      }
      // "skip" → nothing to save
      return true;
    } finally {
      setSaving(false);
    }
  };

  // ── Step 4 save: AI preferences ───────────────────────────────────────────
  const saveTone = async (): Promise<boolean> => {
    setSaving(true);
    const rules = avoidText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20);

    const payload = {
      user_id: user.id,
      response_style: tone,
      rules: rules as any,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from("ai_preferences")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = existing
      ? await db.from("ai_preferences").update(payload).eq("id", (existing as { id: string }).id)
      : await db.from("ai_preferences").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save AI preferences", variant: "destructive" });
      return false;
    }
    return true;
  };

  // ── Slug generation on reaching step 5 ────────────────────────────────────
  const ensureSlug = useCallback(async () => {
    const { data: existing } = await db
      .from("profiles")
      .select("slug")
      .eq("user_id", user.id)
      .limit(1);
    const current = (Array.isArray(existing) && existing[0]?.slug) || "";
    if (current) {
      setSlug(current);
      return;
    }

    // Generate slug from display name; fall back to random suffix for uniqueness.
    const base = slugify(displayName) || `user-${user.id.slice(0, 6)}`;
    const candidates = [base, `${base}-${Math.random().toString(36).slice(2, 6)}`];
    for (const candidate of candidates) {
      const { error } = await db
        .from("profiles")
        .upsert({ user_id: user.id, slug: candidate }, { onConflict: "user_id" });
      if (!error) {
        setSlug(candidate);
        return;
      }
    }
    toast({ title: "Couldn't reserve a card URL — set one in Connections", variant: "destructive" });
  }, [user.id, displayName, toast]);

  useEffect(() => {
    if (step === 5 && !slug) ensureSlug();
  }, [step, slug, ensureSlug]);

  // ── Advance handler per step ──────────────────────────────────────────────
  const handleNext = async () => {
    if (step === 1) return goNext();
    if (step === 2) {
      if (await saveBasicInfo()) goNext();
      return;
    }
    if (step === 3) {
      if (await saveGrounding()) goNext();
      return;
    }
    if (step === 4) {
      if (await saveTone()) goNext();
      return;
    }
  };

  const copyUrl = async () => {
    if (!cardUrl) return;
    try {
      await navigator.clipboard.writeText(cardUrl);
      setCopied(true);
      toast({ title: "Card URL copied" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  // Enter-to-advance where sensible (not in textareas; those want newlines).
  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) handleNext();
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4">
      <Card className="w-full max-w-xl bg-card/60 border-border/30 shadow-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              Step {step} of 5
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    n <= step ? "bg-primary" : "bg-border/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4 text-center py-6">
              <h2 className="text-2xl font-bold text-foreground font-sans">Welcome</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Let's set up your card in about 3 minutes. You can edit anything later.
              </p>
              <Button
                ref={focusRef as React.RefObject<HTMLButtonElement>}
                size="lg"
                className="mt-2"
                onClick={handleNext}
              >
                Let's go <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={onFormSubmit} className="space-y-5">
              <div className="space-y-1">
                <CardTitle className="text-xl font-sans">Tell us about you</CardTitle>
                <CardDescription>These go on your card.</CardDescription>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-name">Your name</Label>
                <Input
                  id="ob-name"
                  ref={focusRef as React.RefObject<HTMLInputElement>}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Jordan Rivera"
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-tagline">Tagline</Label>
                <Input
                  id="ob-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. LCSW, private practice"
                  required
                />
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <CardTitle className="text-xl font-sans">Ground your card</CardTitle>
                <CardDescription>
                  Give the AI something to work from. You can add more later.
                </CardDescription>
              </div>

              <div className="space-y-2" role="radiogroup" aria-label="Grounding source">
                <GroundingOption
                  icon={<Globe className="w-4 h-4" />}
                  label="Paste a website URL"
                  hint="We'll save it so you can verify & scrape it later."
                  value="site"
                  selected={grounding}
                  onSelect={setGrounding}
                />
                <GroundingOption
                  icon={<PenLine className="w-4 h-4" />}
                  label={`Type an "about me"`}
                  hint="A few sentences is plenty."
                  value="bio"
                  selected={grounding}
                  onSelect={setGrounding}
                />
                <GroundingOption
                  icon={<SkipForward className="w-4 h-4" />}
                  label="Skip for now"
                  hint="Add grounding later from the admin."
                  value="skip"
                  selected={grounding}
                  onSelect={setGrounding}
                />
              </div>

              {grounding === "site" && (
                <div className="space-y-2">
                  <Label htmlFor="ob-site">Website URL</Label>
                  <Input
                    id="ob-site"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://your-practice.com"
                    autoComplete="url"
                  />
                </div>
              )}

              {grounding === "bio" && (
                <div className="space-y-2">
                  <Label htmlFor="ob-bio">About me</Label>
                  <Textarea
                    id="ob-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="I'm a clinical social worker in Portland, specializing in..."
                    rows={5}
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <CardTitle className="text-xl font-sans">Tone &amp; rules</CardTitle>
                <CardDescription>How should your AI sound?</CardDescription>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Tone">
                {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tone === t}
                    onClick={() => setTone(t)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      tone === t
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border/30 bg-card/30 hover:bg-card/50"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{TONE_LABELS[t].label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{TONE_LABELS[t].desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ob-avoid">Anything I should never say? (optional)</Label>
                <Textarea
                  id="ob-avoid"
                  value={avoidText}
                  onChange={(e) => setAvoidText(e.target.value)}
                  placeholder={"One per line, e.g.:\nDon't give medical advice\nDon't discuss pricing"}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Each non-empty line becomes a rule.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <CardTitle className="text-xl font-sans flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Your card is live
                </CardTitle>
                <CardDescription>Share the link — or tweak more in the admin.</CardDescription>
              </div>

              <div className="rounded-xl bg-secondary/50 border border-border/30 p-3 flex items-center gap-2">
                <code className="flex-1 text-xs text-foreground truncate">
                  {cardUrl || "Generating your card URL…"}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyUrl}
                  disabled={!cardUrl}
                  aria-label="Copy card URL"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={!cardUrl}
                  onClick={() => window.open(cardUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="w-4 h-4 mr-1" /> View my card
                </Button>
                <Button ref={focusRef as React.RefObject<HTMLButtonElement>} onClick={onDone}>
                  <SettingsIcon className="w-4 h-4 mr-1" /> Go to admin
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {/* Nav footer — hidden on step 1 and 5, which have their own CTAs */}
        {step > 1 && step < 5 && (
          <div className="flex items-center justify-between px-6 pb-6">
            <Button variant="ghost" onClick={goBack} disabled={saving}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-1" />
              )}
              {step === 4 ? "Finish" : "Next"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function GroundingOption({
  icon,
  label,
  hint,
  value,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: GroundingPath;
  selected: GroundingPath;
  onSelect: (v: GroundingPath) => void;
}) {
  const isSelected = selected === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={() => onSelect(value)}
      className={`w-full rounded-xl border-2 p-3 text-left flex items-start gap-3 transition-all ${
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border/30 bg-card/30 hover:bg-card/50"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
