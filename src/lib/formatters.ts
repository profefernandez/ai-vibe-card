/**
 * Shared formatting utilities.
 * Re-used across SiteImportTab, KnowledgeBaseTab, etc.
 */

/** Relative time label from a date string — "Just now", "5m ago", "3d ago", etc. */
export function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}
