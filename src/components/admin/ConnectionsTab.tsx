import { useState, useEffect, useMemo } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, Connection, ConnectionStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    UserPlus, Check, X, Trash2, Link2, Copy, Clock,
    Globe, QrCode, ChevronDown, ChevronUp,
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
        try {
            const session = JSON.parse(localStorage.getItem("vps_session") || "null");
            const res = await fetch(
                `${import.meta.env.VITE_API_URL || "/api"}/connections`,
                { headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {} },
            );
            if (res.ok) setConnections(await res.json());
        } catch { /* ignore */ }
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
            await db.from("profiles").upsert({ user_id: user.id, slug: clean }, "user_id");
            setSlug(clean);
            setEditingSlug(false);
            toast({ title: "Share slug updated" });
        } catch {
            toast({ title: "Failed to update slug — it may already be taken", variant: "destructive" });
        }
    };

    const handleAction = async (id: string, action: "approved" | "declined" | "delete") => {
        try {
            const session = JSON.parse(localStorage.getItem("vps_session") || "null");
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
            };
            if (action === "delete") {
                await fetch(`${import.meta.env.VITE_API_URL || "/api"}/connections/${id}`, {
                    method: "DELETE",
                    headers,
                });
                toast({ title: "Connection removed" });
            } else {
                await fetch(`${import.meta.env.VITE_API_URL || "/api"}/connections/${id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: action }),
                });
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
                        <ConnectionCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))}
                </Section>
            )}

            {/* Connected */}
            <Section title="Connected" icon={<Check className="w-5 h-5 text-green-500" />} count={approved.length}>
                {approved.length === 0 ? (
                    <EmptyState text="No connections yet. Share your card link to get started!" />
                ) : (
                    approved.map((c) => (
                        <ConnectionCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
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
                        <ConnectionCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
                    ))}
                </Section>
            )}

            {/* Declined */}
            {declined.length > 0 && (
                <CollapsibleSection title="Declined" count={declined.length}>
                    {declined.map((c) => (
                        <ConnectionCard key={c.id} connection={c} userId={user.id} onAction={handleAction} />
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
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
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
            {open && <div className="grid gap-3 sm:grid-cols-2">{children}</div>}
        </div>
    );
}

function ConnectionCard({ connection: c, userId, onAction }: {
    connection: Connection; userId: string;
    onAction: (id: string, action: "approved" | "declined" | "delete") => void;
}) {
    const isOwner = c.owner_id === userId;
    const isPending = c.status === "pending";
    return (
        <div className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-3">
            <div className="flex items-center gap-3">
                {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-primary/20" />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                            {c.display_name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{c.display_name || "Unknown"}</p>
                    {c.tagline && (
                        <p className="text-xs text-muted-foreground truncate">{c.tagline}</p>
                    )}
                </div>
                <span className={`text-xs font-medium ${statusColor[c.status]}`}>
                    {statusLabel[c.status]}
                </span>
            </div>

            {c.message && (
                <p className="text-xs text-muted-foreground italic line-clamp-2">"{c.message}"</p>
            )}

            <div className="flex items-center gap-2">
                {isPending && isOwner && (
                    <>
                        <Button size="sm" variant="default" onClick={() => onAction(c.id, "approved")}>
                            <Check className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAction(c.id, "declined")}>
                            <X className="w-3 h-3 mr-1" /> Decline
                        </Button>
                    </>
                )}
                {c.slug && c.status === "approved" && (
                    <a
                        href={`/card/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                        <Globe className="w-3 h-3" /> View Card
                    </a>
                )}
                <div className="flex-1" />
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onAction(c.id, "delete")}
                    aria-label="Remove connection"
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>
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
