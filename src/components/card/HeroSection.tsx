import { useEffect, useState } from "react";
import { apiClient as db } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import type { Profile } from "@/types";
import CardView from "./CardView";

const HeroSection = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      // Logged-in users see their own card; visitors see the first profile (default/marketing).
      const query = user
        ? db.from("profiles").select("*").eq("user_id", user.id).maybeSingle()
        : db.from("profiles").select("*").limit(1).maybeSingle();

      const { data } = await query;
      if (cancelled || !data) return;

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
        theme: data.theme || "dark",
        accent_color: data.accent_color || "amber",
        seo_title: data.seo_title || "",
        seo_description: data.seo_description || "",
        og_image_url: data.og_image_url || "",
        twitter_handle: data.twitter_handle || "",
        robots_txt: data.robots_txt,
        slug: data.slug || "",
        ai_query_enabled: !!data.ai_query_enabled,
      });
      setProfileId(data.user_id ?? null);
    };

    loadProfile();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    // Owner's first verified site is the chat's grounding source.
    const q = db.from("sites").select("id").eq("verified", true);
    const scoped = profileId ? q.eq("user_id", profileId) : q;
    scoped
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.id) setSiteId(data.id);
      });
    return () => { cancelled = true; };
  }, [profileId]);

  const showScanLink = !!(profile as any)?.show_qr_scan_link;

  return (
    <CardView
      profile={profile}
      siteId={siteId}
      profileId={profileId}
      showScanLink={showScanLink}
    />
  );
};

export default HeroSection;
