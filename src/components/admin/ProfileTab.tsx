import { useState, useEffect, useRef } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, Profile, SocialLink, CardLayout } from "@/types";
import { PLATFORM_OPTIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, User as UserIcon, Plus, X, LayoutTemplate, Upload, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

export type { SocialLink, CardLayout };

interface ProfileTabProps {
  user: User;
}

export default function ProfileTab({ user }: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    tagline: "",
    bio: "",
    avatar_url: "",
    cta_url: "",
    cta_label: "Get in Touch",
    cta_embed: "",
    social_links: [],
    card_layout: "classic",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await db
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setProfile({
        display_name: data.display_name || "",
        tagline: data.tagline || "",
        bio: data.bio || "",
        avatar_url: data.avatar_url || "",
        cta_url: data.cta_url || "",
        cta_label: data.cta_label || "Get in Touch",
        cta_embed: data.cta_embed || "",
        social_links: Array.isArray(data.social_links) ? data.social_links : [],
        card_layout: data.card_layout === "bold" ? "bold" : "classic",
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await db
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          ...profile,
          social_links: profile.social_links as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved!");
    }
    setSaving(false);
  };

  const addSocialLink = () => {
    if (profile.social_links.length >= 12) return;
    setProfile({
      ...profile,
      social_links: [...profile.social_links, { platform: "linkedin", url: "" }],
    });
  };

  const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => {
    const updated = [...profile.social_links];
    updated[index] = { ...updated[index], [field]: value };
    setProfile({ ...profile, social_links: updated });
  };

  const removeSocialLink = (index: number) => {
    setProfile({
      ...profile,
      social_links: profile.social_links.filter((_, i) => i !== index),
    });
  };

  const moveSocialLink = (from: number, to: number) => {
    if (to < 0 || to >= profile.social_links.length) return;
    const updated = [...profile.social_links];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setProfile({ ...profile, social_links: updated });
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    const { url, error } = await db.upload.avatar(file);
    if (error || !url) {
      toast.error(error?.message || "Upload failed");
    } else {
      // Append cache-buster so the browser reloads the image
      setProfile({ ...profile, avatar_url: `${url}?t=${Date.now()}` });
      toast.success("Photo uploaded!");
    }
    setUploading(false);
  };

  const handleAvatarDelete = async () => {
    setUploading(true);
    const { error } = await db.upload.deleteAvatar();
    if (error) {
      toast.error(error.message || "Delete failed");
    } else {
      setProfile({ ...profile, avatar_url: "" });
      toast.success("Photo removed");
    }
    setUploading(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarUpload(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleAvatarUpload(file);
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
        <h2 className="text-xl font-bold text-foreground font-sans">Profile / Card Info</h2>
        <p className="text-sm text-muted-foreground">Edit your business card details visible to others.</p>
      </div>

      {/* ── Card Layout Picker ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <LayoutTemplate className="w-4 h-4 text-primary" /> Card Layout
          </CardTitle>
          <CardDescription>Choose how your business card looks to visitors.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Card layout options">
            {/* Classic layout preview */}
            <button
              type="button"
              role="radio"
              aria-checked={profile.card_layout === "classic"}
              onClick={() => setProfile({ ...profile, card_layout: "classic" })}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${profile.card_layout === "classic"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border/30 bg-card/30 hover:bg-card/50"
                }`}
            >
              {/* Mini card preview */}
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30" />
                <div className="w-16 h-2 rounded bg-foreground/20" />
                <div className="w-12 h-1.5 rounded bg-amber-200/30" />
                <div className="flex gap-1.5 mt-1">
                  <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                  <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                  <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground mt-2 text-center">Classic</p>
              <p className="text-xs text-muted-foreground text-center">Centered, photo on top</p>
            </button>

            {/* Bold layout preview */}
            <button
              type="button"
              role="radio"
              aria-checked={profile.card_layout === "bold"}
              onClick={() => setProfile({ ...profile, card_layout: "bold" })}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${profile.card_layout === "bold"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border/30 bg-card/30 hover:bg-card/50"
                }`}
            >
              {/* Mini card preview */}
              <div className="flex items-start gap-3 py-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex-shrink-0" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="w-full h-2.5 rounded bg-foreground/20" />
                  <div className="w-3/4 h-1.5 rounded bg-amber-200/30" />
                  <div className="flex gap-1.5 mt-1">
                    <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                    <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                    <div className="w-5 h-5 rounded-full bg-secondary/80 border border-primary/20" />
                  </div>
                </div>
              </div>
              <p className="text-sm font-medium text-foreground mt-2 text-center">Bold</p>
              <p className="text-xs text-muted-foreground text-center">Side-by-side, left-aligned</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Business Card Details ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-sans">
            <UserIcon className="w-4 h-4 text-primary" /> Business Card Details
          </CardTitle>
          <CardDescription>This info appears on your shared card.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={profile.display_name}
                onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={profile.tagline}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                placeholder="e.g. Full-Stack Developer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="A short bio about yourself..."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={onFileChange}
              />
              {profile.avatar_url ? (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50">
                  <img
                    src={profile.avatar_url}
                    alt="Avatar preview"
                    className="w-16 h-16 rounded-full object-cover border-2 border-primary/30"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <span className="text-sm text-muted-foreground truncate">Current photo</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                        Replace
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={uploading}
                        onClick={handleAvatarDelete}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragOver
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-secondary/30 hover:border-primary/50 hover:bg-secondary/50"
                    }`}
                >
                  {uploading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground text-center">
                    {uploading ? "Uploading…" : "Click or drag & drop to upload"}
                  </span>
                  <span className="text-xs text-muted-foreground/60">JPEG, PNG, WebP, GIF — max 5 MB</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta_label">Button Label</Label>
              <Input
                id="cta_label"
                value={profile.cta_label}
                onChange={(e) => setProfile({ ...profile, cta_label: e.target.value })}
                placeholder="Get in Touch"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta_url">Button Link (fallback if no embed)</Label>
              <Input
                id="cta_url"
                value={profile.cta_url}
                onChange={(e) => setProfile({ ...profile, cta_url: e.target.value })}
                placeholder="https://your-link.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta_embed">Embed Code (optional)</Label>
            <Textarea
              id="cta_embed"
              value={profile.cta_embed}
              onChange={(e) => setProfile({ ...profile, cta_embed: e.target.value })}
              placeholder='<iframe src="https://calendly.com/you" ...></iframe>'
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Paste a scheduling widget embed (Calendly, Cal.com, Acuity, etc.). When set, the CTA button opens the embed inside the card instead of linking out.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Social Links ── */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-base font-sans">Social Links</CardTitle>
          <CardDescription>
            Add up to 12 social links. They auto-space evenly on the card. Drag to reorder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.social_links.map((link, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveSocialLink(i, i - 1)}
                  disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                  aria-label={`Move ${link.platform} link up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveSocialLink(i, i + 1)}
                  disabled={i === profile.social_links.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                  aria-label={`Move ${link.platform} link down`}
                >
                  ▼
                </button>
              </div>
              <select
                value={link.platform}
                onChange={(e) => updateSocialLink(i, "platform", e.target.value)}
                className="h-9 rounded-md border border-border/30 bg-secondary/60 px-2 text-sm text-foreground"
                aria-label={`Platform for social link ${i + 1}`}
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Input
                value={link.url}
                onChange={(e) => updateSocialLink(i, "url", e.target.value)}
                placeholder={
                  link.platform === "phone"
                    ? "tel:+15551234567"
                    : link.platform === "email"
                      ? "mailto:you@example.com"
                      : "https://..."
                }
                className="flex-1 bg-secondary/60 border-border/30"
                aria-label={`URL for ${link.platform} link`}
              />
              <button
                type="button"
                onClick={() => removeSocialLink(i)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Remove ${link.platform} link`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {profile.social_links.length < 12 && (
            <Button variant="outline" size="sm" onClick={addSocialLink} className="w-full">
              <Plus className="w-4 h-4 mr-1" /> Add Social Link
            </Button>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
        Save Profile
      </Button>
    </div>
  );
}
