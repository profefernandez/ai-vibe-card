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
    theme: string;
    accent_color: string;
    seo_title: string;
    seo_description: string;
    og_image_url: string;
    twitter_handle: string;
    robots_txt: unknown;
    slug: string;
    ai_query_enabled: boolean;
    show_qr_scan_link?: boolean;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export type ScrapeStatus = "pending" | "scraping" | "completed" | "error";

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
    scrape_status: ScrapeStatus;
    page_count: number;
    share_usage_limit: number;
    last_scraped_at: string | null;
    created_at: string;
}

// ─── Content ──────────────────────────────────────────────────────────────────

export interface ContentBlock {
    id: string;
    site_id: string;
    page_id: string;
    heading: string | null;
    body: string | null;
    images: string[];
    category: string | null;
    tags: string[] | null;
    visibility: string;
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

// ─── Connections ──────────────────────────────────────────────────────────────────────────

export type ConnectionStatus = "pending" | "approved" | "declined";

export interface Connection {
    id: string;
    requester_id: string;
    owner_id: string;
    status: ConnectionStatus;
    message: string;
    created_at: string;
    updated_at: string;
    approved_at: string | null;
    // Joined fields from profile
    display_name?: string;
    avatar_url?: string;
    tagline?: string;
    slug?: string;
    bio?: string;
    cta_url?: string;
    cta_label?: string;
    social_links?: SocialLink[];
    theme?: string;
    accent_color?: string;
    ai_query_enabled?: boolean;
}

// ─── AI Preferences ──────────────────────────────────────────────────────────

export interface AiPreferences {
    system_prompt: string;
    rules: string[];
    personality: string;
    response_style: string;
    prompt_injection_rules: string[];
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
