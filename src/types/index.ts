/**
 * Shared types used across the application.
 * Single source of truth — import from "@/types" everywhere.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
    id: string;
    email: string;
}

export interface Session {
    user: User;
    token: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export type SocialLink = {
    platform: string;
    url: string;
};

export type CardLayout = "classic" | "bold";

export interface Profile {
    display_name: string;
    tagline: string;
    bio: string;
    avatar_url: string;
    cta_url: string;
    cta_label: string;
    cta_embed: string;
    social_links: SocialLink[];
    card_layout: CardLayout;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export type ScrapeStatus = "pending" | "scraping" | "done" | "error";

export type VerificationMethod = "dns_txt" | "meta_tag";

export interface Site {
    id: string;
    domain: string;
    name: string | null;
    verified: boolean;
    verification_token: string | null;
    verification_method: VerificationMethod | null;
    verified_at: string | null;
    verification_expires_at: string | null;
    scrape_status: string;
    page_count: number;
    share_usage_limit: number;
    last_scraped_at: string | null;
    created_at: string;
}

// ─── Content ──────────────────────────────────────────────────────────────────

export interface ContentBlock {
    id: string;
    site_id: string;
    heading: string | null;
    body: string | null;
    images: string[];
    category: string | null;
    tags: string[] | null;
    block_order: number;
}

// ─── API Connections ──────────────────────────────────────────────────────────

export type ApiProvider = "openai" | "anthropic" | "google" | "lemonade";

export interface ApiConnection {
    id: string;
    provider: string;
    api_key_encrypted: string;
    model_name: string;
    is_active: boolean;
}

// ─── Received Cards ───────────────────────────────────────────────────────────

export interface ReceivedCard {
    id: string;
    sender_name: string;
    sender_domain: string;
    sender_avatar: string;
    sender_tagline: string;
    notes: string;
    usage_count: number;
    usage_limit: number;
    created_at: string;
}

// ─── AI Preferences ──────────────────────────────────────────────────────────

export interface AiPreferences {
    system_prompt: string;
    rules: string[];
    personality: string;
    response_style: string;
    injection_rules: string[];
    safety_protocol: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface SiteSettings {
    id: string;
    domain: string;
    share_usage_limit: number;
}

export interface RobotDirective {
    userAgent: string;
    rules: { action: "allow" | "disallow"; path: string }[];
}

export interface CrawlerToggles {
    searchEngines: boolean;
    socialPreviews: boolean;
    aiBots: boolean;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
    role: ChatRole;
    content: string;
}
