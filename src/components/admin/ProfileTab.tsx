import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

interface ProfileTabProps {
  user: User;
}

interface Profile {
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string;
  calendly_url: string;
}

export default function ProfileTab({ user }: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    tagline: "",
    bio: "",
    avatar_url: "",
    calendly_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        calendly_url: data.calendly_url || "",
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await db
      .from("profiles")
      .upsert(
        { user_id: user.id, ...profile, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved!");
    }
    setSaving(false);
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
              <Label htmlFor="avatar_url">Avatar URL</Label>
              <Input
                id="avatar_url"
                value={profile.avatar_url}
                onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
                placeholder="https://example.com/avatar.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendly_url">Calendly URL</Label>
              <Input
                id="calendly_url"
                value={profile.calendly_url}
                onChange={(e) => setProfile({ ...profile, calendly_url: e.target.value })}
                placeholder="https://calendly.com/you"
              />
            </div>
          </div>

          {profile.avatar_url && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <img
                src={profile.avatar_url}
                alt="Avatar preview"
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/30"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="text-sm text-muted-foreground">Avatar preview</span>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
