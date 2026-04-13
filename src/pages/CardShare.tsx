import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { apiClient as db } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { applyTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Loader2, Globe, UserPlus, Check, Clock, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SocialLink } from "@/types";

interface CardProfile {
    display_name: string;
    tagline: string;
    bio: string;
    avatar_url: string;
    cta_url: string;
    cta_label: string;
    social_links: SocialLink[];
    card_layout: string;
    theme: string;
    accent_color: string;
    slug: string;
}

type ConnectState = "idle" | "sending" | "sent" | "already" | "error";

const CardShare = () => {
    const { slug } = useParams<{ slug: string }>();
    const { user } = useAuth();
    const { toast } = useToast();
    const [profile, setProfile] = useState<CardProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [connectState, setConnectState] = useState<ConnectState>("idle");
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!slug) return;
        fetch(`${import.meta.env.VITE_API_URL || "/api"}/card/${encodeURIComponent(slug)}`)
            .then(async (res) => {
                if (!res.ok) { setNotFound(true); return; }
                const data = await res.json();
                setProfile(data);
                applyTheme(data.theme || "dark", data.accent_color || "amber");
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

    const cardUrl = window.location.href;

    return (
        <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6">
                {/* Card */}
                <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-lg p-8 text-center space-y-4">
                    {/* Avatar */}
                    {profile.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt={profile.display_name}
                            className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-primary/30"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full mx-auto bg-primary/20 flex items-center justify-center">
                            <span className="text-3xl font-bold text-primary">
                                {profile.display_name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                        </div>
                    )}

                    {/* Name + tagline */}
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
                        {profile.tagline && (
                            <p className="text-sm text-muted-foreground mt-1">{profile.tagline}</p>
                        )}
                    </div>

                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
                    )}

                    {/* CTA */}
                    {profile.cta_url && (
                        <a
                            href={profile.cta_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5"
                        >
                            <Button className="w-full">
                                <ExternalLink className="w-4 h-4 mr-1" />
                                {profile.cta_label || "Get in Touch"}
                            </Button>
                        </a>
                    )}

                    {/* Social links */}
                    {profile.social_links?.length > 0 && (
                        <div className="flex justify-center gap-3 pt-2">
                            {profile.social_links.map((link, i) => (
                                <a
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                                >
                                    <Globe className="w-3 h-3" />
                                    {link.platform}
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* Connect section */}
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

                {/* QR Code */}
                <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-lg p-6 flex flex-col items-center space-y-3">
                    <p className="text-xs text-muted-foreground">Scan to view this card</p>
                    <div className="bg-white p-3 rounded-xl">
                        <QRCodeSVG value={cardUrl} size={160} level="M" />
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground/50">
                    Powered by <Link to="/" className="hover:text-primary transition-colors">AI Vibe Card</Link>
                </p>
            </div>
        </div>
    );
};

export default CardShare;
