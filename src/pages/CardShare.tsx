import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Check, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient as db } from "@/lib/apiClient";
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
        let cancelled = false;
        (async () => {
            // `get_card_by_slug` returns a TABLE row — chain `.maybeSingle()`
            // so supabase-js unwraps it into `data` (or `null`) for us.
            const builder = db.rpc("get_card_by_slug", { p_slug: slug }) as unknown as {
                maybeSingle: () => Promise<{ data: CardApiResponse | null; error: { message: string } | null }>;
            };
            const { data: row, error } = await builder.maybeSingle();
            if (cancelled) return;
            if (error || !row) {
                setNotFound(true);
                setLoading(false);
                return;
            }
            setProfile({
                display_name: row.display_name || "",
                tagline: row.tagline || "",
                bio: row.bio || "",
                avatar_url: row.avatar_url || "",
                cta_url: row.cta_url || "",
                cta_label: row.cta_label || "Get in Touch",
                cta_embed: row.cta_embed || "",
                social_links: Array.isArray(row.social_links) ? row.social_links : [],
                card_layout: row.card_layout === "bold" ? "bold" : "classic",
                theme: row.theme || "dark",
                accent_color: row.accent_color || "amber",
                seo_title: row.seo_title || "",
                seo_description: row.seo_description || "",
                og_image_url: row.og_image_url || "",
                twitter_handle: row.twitter_handle || "",
                robots_txt: (row as { robots_txt?: unknown }).robots_txt as Profile["robots_txt"],
                slug: row.slug || "",
                ai_query_enabled: !!row.ai_query_enabled,
                show_qr_scan_link: !!(row as { show_qr_scan_link?: boolean }).show_qr_scan_link,
                services: Array.isArray((row as { services?: unknown }).services)
                    ? ((row as { services?: Profile["services"] }).services ?? [])
                    : [],
            });
            setProfileId(row.user_id ?? null);
            setSiteId(row.site_id ?? null);
            setLoading(false);
        })().catch(() => {
            if (!cancelled) {
                setNotFound(true);
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [slug]);

    const handleConnect = async () => {
        if (!user || !slug) return;
        setConnectState("sending");
        const { data, error } = await db.functions.invoke("connection-request", {
            body: { slug, message },
        });
        if (!error) {
            setConnectState("sent");
            toast({ title: "Connection request sent!" });
            return;
        }
        // Edge Function returns the server JSON in `error.context` for non-2xx;
        // fall back to a generic message if we can't read it.
        const ctx = (error as { context?: Response }).context;
        let serverMsg: string | undefined;
        let status: number | undefined;
        if (ctx && typeof ctx.json === "function") {
            try {
                const parsed = (await ctx.json()) as { error?: string };
                serverMsg = parsed.error;
                status = ctx.status;
            } catch { /* ignore */ }
        }
        if (status === 409) {
            setConnectState("already");
            toast({ title: serverMsg || "Already connected" });
        } else {
            setConnectState("error");
            toast({ title: serverMsg || error.message || "Failed to connect", variant: "destructive" });
        }
        // Suppress unused-warning when no server JSON was readable.
        void data;
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
