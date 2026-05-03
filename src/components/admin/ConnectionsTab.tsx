import { useState, useEffect, useMemo } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, Connection, ConnectionStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import MiniCard from "./MiniCard";
import {
    UserPlus, Check, Link2, Copy, Clock,
    QrCode, ChevronDown, ChevronUp,
} from "lucide-react";

interface ConnectionsTabProps {
    user: User;
}

const statusLabel: Record<ConnectionStatus, string> = {
    pending: "Pending",
    approved: "Connected",
    declined: "Declined",
};

const statusColor: Record<ConnectionStatus, string> = {
    pending: "text-yellow-500",
    approved: "text-green-500",
    declined: "text-muted-foreground",
};

const ConnectionsTab = ({ user }: ConnectionsTabProps) => {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [slug, setSlug] = useState("");
    const [editingSlug, setEditingSlug] = useState(false);
    const [slugInput, setSlugInput] = useState("");
    const [showQr, setShowQr] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        fetchConnections();
        fetchSlug();
    }, []);

    const fetchConnections = async () => {
        // Connections RLS (`connections_party_select`) lets the caller see
        // every row where they are requester or owner. We fetch both sides
        // of the JOIN — `requester:profiles!requester_id(...)` and
        // `owner:profiles!owner_id(...)` — and pick the *other* party in
        // the mapper below so the existing `MiniCard` props stay flat.
        const profileCols = "user_id, display_name, avatar_url, tagline, slug, bio, cta_url, cta_label, social_links, theme, accent_color, ai_query_enabled";
        const { data, error } = await db
            .from("connections")
            .select(
                `id, requester_id, owner_id, status, message, created_at, updated_at, approved_at, requester:profiles!requester_id(${profileCols}), owner:profiles!owner_id(${profileCols})`,
            )
            .or(`owner_id.eq.${user.id},requester_id.eq.${user.id}`)
            .order("created_at", { ascending: false });
        if (error || !data) {
            setConnections([]);
            return;
        }
        type RawRow = Connection & {
            requester?: Partial<Connection> | null;
            owner?: Partial<Connection> | null;
        };
        const merged: Connection[] = (data as RawRow[]).map((row) => {
            const other = row.owner_id === user.id ? row.requester : row.owner;
            return {
                id: row.id,
                requester_id: row.requester_id,
                owner_id: row.owner_id,
                status: row.status,
                message: row.message,
                created_at: row.created_at,
                updated_at: row.updated_at,
                approved_at: row.approved_at,
                display_name: other?.display_name,
                avatar_url: other?.avatar_url,
                tagline: other?.tagline,
                slug: other?.slug,
                bio: other?.bio,
                cta_url: other?.cta_url,
                cta_label: other?.cta_label,
                social_links: other?.social_links,
                theme: other?.theme,
                accent_color: other?.accent_color,
                ai_query_enabled: other?.ai_query_enabled,
            };
        });
        setConnections(merged);
    };

    const fetchSlug = async () => {
        const { data } = await db
            .from("profiles")
            .select("slug")
            .eq("user_id", user.id);
        if (data?.[0]) {
            setSlug(data[0].slug || "");
            setSlugInput(data[0].slug || "");
        }
    };

    const saveSlug = async () => {
        const clean = slugInput.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
        if (!clean) {
            toast({ title: "Slug cannot be empty", variant: "destructive" });
            return;
        }
        try {
            await db.from("profiles").upsert({ user_id: user.id, slug: clean }, { onConflict: "user_id" });
            setSlug(clean);
            setEditingSlug(false);
            toast({ title: "Share slug updated" });
        } catch {
            toast({ title: "Failed to update slug — it may already be taken", variant: "destructive" });
        }
    };

    const handleAction = async (id: string, action: "approved" | "declined" | "delete") => {
        try {
            if (action === "delete") {
                // RLS `connections_party_delete` lets either party remove the row.
                const { error } = await db.from("connections").delete().eq("id", id);
                if (error) throw new Error(error.message);
                toast({ title: "Connection removed" });
            } else {
                const { error } = await db.functions.invoke("connection-respond", {
                    body: { id, status: action },
                });
                if (error) throw error;
                toast({ title: action === "approved" ? "Connection approved" : "Connection declined" });
            }
            fetchConnections();
        } catch {
            toast({ title: "Action failed", variant: "destructive" });
        }
    };

    const copyShareLink = () => {
        const url = `${window.location.origin}/card/${slug}`;
        navigator.clipboard.writeText(url);
        toast({ title: "Share link copied!" });
    };

    const incoming = useMemo(() => connections.filter((c) => c.owner_id === user.id), [connections, user.id]);
    const outgoing = useMemo(() => connections.filter((c) => c.requester_id === user.id), [connections, user.id]);
    const pending = incoming.filter((c) => c.status === "pending");
    const approved = connections.filter((c) => c.status === "approved");
    const declined = incoming.filter((c) => c.status === "declined");

    const shareUrl = slug ? `${window.location.origin}/card/${slug}` : "";

    return (
        <div className="space-y-6">
            {/* Share Link Section */}
            <div className="rounded-2xl border border-border/20 bg-card/20 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-primary" /> Your Share Link
                </h2>

                {editingSlug ? (
                    <div className="flex gap-2">
                        <div className="flex-1 flex items-center gap-1 rounded-lg border border-border/30 bg-background/50 px-3">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {window.location.origin}/card/
                            </span>
                            <input
                                value={slugInput}
                                onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                                className="flex-1 bg-transparent text-sm text-foreground outline-none py-2"
                                maxLength={60}
                                placeholder="your-custom-slug"
                                autoFocus
                            />
                        </div>
                        <Button size="sm" onClick={saveSlug}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingSlug(false); setSlugInput(slug); }}>
                            Cancel
                        </Button>
                    </div>
                ) : slug ? (
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs text-muted-foreground bg-background/50 rounded-lg px-3 py-2 truncate">
                            {shareUrl}
                        </code>
                        <Button size="icon" variant="ghost" onClick={copyShareLink} aria-label="Copy share link">
                            <Copy className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setShowQr(!showQr)} aria-label="Toggle QR code">
                            <QrCode className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingSlug(true)}>
                            Edit
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Set a custom slug to create your shareable card link.
                        </p>
                        <Button size="sm" onClick={() => setEditingSlug(true)}>
                            <Link2 className="w-4 h-4 mr-1" /> Create Share Link
                        </Button>
                    </div>
                )}

                {showQr && shareUrl && (
                    <div className="flex justify-center pt-2">
                        <div className="bg-white p-3 rounded-xl">
                            {/* Lazy-load QR to avoid importing in the admin bundle for non-QR users */}
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
                                alt="QR Code"
                                className="w-[180px] h-[180px]"
                                loading="lazy"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Pending Requests */}
            {pending.length > 0 && (
                <Section title="Pending Requests" icon={<Clock className="w-5 h-5 text-yellow-500" />} count={pending.length}>
                    {pending.map((c) => (
                        <MiniCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))}
                </Section>
            )}

            {/* Connected */}
            <Section title="Connected" icon={<Check className="w-5 h-5 text-green-500" />} count={approved.length}>
                {approved.length === 0 ? (
                    <EmptyState text="No connections yet. Share your card link to get started!" />
                ) : (
                    approved.map((c) => (
                        <MiniCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))
                )}
            </Section>

            {/* Outgoing pending */}
            {outgoing.filter((c) => c.status === "pending").length > 0 && (
                <Section
                    title="Sent Requests"
                    icon={<UserPlus className="w-5 h-5 text-primary" />}
                    count={outgoing.filter((c) => c.status === "pending").length}
                >
                    {outgoing.filter((c) => c.status === "pending").map((c) => (
                        <MiniCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))}
                </Section>
            )}

            {/* Declined */}
            {declined.length > 0 && (
                <CollapsibleSection title="Declined" count={declined.length}>
                    {declined.map((c) => (
                        <MiniCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))}
                </CollapsibleSection>
            )}
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon, count, children }: {
    title: string; icon: React.ReactNode; count: number; children: React.ReactNode;
}) {
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {icon} {title}
                <span className="text-xs text-muted-foreground font-normal">({count})</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </div>
    );
}

function CollapsibleSection({ title, count, children }: {
    title: string; count: number; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="space-y-3">
            <button
                onClick={() => setOpen(!open)}
                className="text-sm font-semibold text-muted-foreground flex items-center gap-2 hover:text-foreground transition-colors"
            >
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {title} ({count})
            </button>
            {open && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>}
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="col-span-full rounded-2xl border border-border/20 bg-card/20 p-8 text-center">
            <UserPlus className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    );
}

export default ConnectionsTab;
