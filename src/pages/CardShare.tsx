import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Check, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CardView from "@/components/card/CardView";
import type { Profile } from "@/types";

interface CardApiResponse extends Partial<Profile> {
    user_id?: string;
    site_id?: string | null;
}

type ConnectState = "idle" | "sending" | "sent" | "already" | "error";

const CardShare = () => {
    const { slug } = useParams<{ slug: string }>();
    const { user } = useAuth();
    const { toast } = useToast();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [siteId, setSiteId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [connectState, setConnectState] = useState<ConnectState>("idle");
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!slug) return;
        fetch(`${import.meta.env.VITE_API_URL || "/api"}/card/${encodeURIComponent(slug)}`)
            .then(async (res) => {
                if (!res.ok) { setNotFound(true); return; }
                const data: CardApiResponse = await res.json();
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
                    robots_txt: (data as any).robots_txt,
                    slug: data.slug || "",
                    ai_query_enabled: !!data.ai_query_enabled,
                    show_qr_scan_link: !!(data as any).show_qr_scan_link,
                    services: Array.isArray((data as any).services) ? (data as any).services : [],
                });
                setProfileId(data.user_id ?? null);
                setSiteId(data.site_id ?? null);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [slug]);

    const handleConnect = async () => {
        if (!user || !slug) return;
        setConnectState("sending");
        try {
            const session = JSON.parse(localStorage.getItem("vps_session") || "null");
            const res = await fetch(
                `${import.meta.env.VITE_API_URL || "/api"}/card/${encodeURIComponent(slug)}/connect`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
                    },
                    body: JSON.stringify({ message }),
                },
            );
            if (res.ok) {
                setConnectState("sent");
                toast({ title: "Connection request sent!" });
            } else {
                const data = await res.json();
                if (res.status === 409) {
                    setConnectState("already");
                    toast({ title: data.error || "Already connected" });
                } else {
                    setConnectState("error");
                    toast({ title: data.error || "Failed to connect", variant: "destructive" });
                }
            }
        } catch {
            setConnectState("error");
            toast({ title: "Network error", variant: "destructive" });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (notFound || !profile) {
        return (
            <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold text-foreground">Card not found</h1>
                    <p className="text-muted-foreground">This card doesn't exist or the link is incorrect.</p>
                    <Link to="/">
                        <Button variant="outline">Go Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-dark">
            <CardView
                profile={profile}
                siteId={siteId}
                profileId={profileId}
                showScanLink={!!profile.show_qr_scan_link}
            />

            {/* Connect / Sign-in prompt below the card */}
            <div className="max-w-lg mx-auto px-4 pb-12 -mt-4">
                <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-lg p-6 space-y-4">
                    {user ? (
                        <>
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-primary" /> Connect
                            </h2>
                            {connectState === "sent" ? (
                                <div className="flex items-center gap-2 text-sm text-green-500">
                                    <Check className="w-4 h-4" /> Request sent!
                                </div>
                            ) : connectState === "already" ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4" /> Already connected or pending
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Add a message (optional)"
                                        maxLength={500}
                                        rows={2}
                                        className="w-full rounded-lg border border-border/30 bg-background/50 p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <Button
                                        className="w-full"
                                        onClick={handleConnect}
                                        disabled={connectState === "sending"}
                                    >
                                        {connectState === "sending" ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                        ) : (
                                            <UserPlus className="w-4 h-4 mr-1" />
                                        )}
                                        Request Connection
                                    </Button>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="text-center space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Sign in to send a connection request
                            </p>
                            <Link to="/auth">
                                <Button variant="outline" size="sm">Sign In</Button>
                            </Link>
                        </div>
                    )}
                </div>

                <p className="text-center text-xs text-muted-foreground/50 mt-4">
                    Powered by <Link to="/" className="hover:text-primary transition-colors">60 Watts of Clarity</Link>
                </p>
            </div>
        </div>
    );
};

export default CardShare;
