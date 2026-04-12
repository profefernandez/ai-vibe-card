/**
 * Zod validation schemas for forms and API payloads.
 * Centralizes validation rules to keep them consistent between
 * frontend forms and any runtime checks.
 */
import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const emailSchema = z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address");

export const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters");

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

// ─── Profile ──────────────────────────────────────────────────────────────────

export const socialLinkSchema = z.object({
    platform: z.string().min(1),
    url: z.string().min(1, "URL is required"),
});

export const profileSchema = z.object({
    display_name: z.string().min(1, "Display name is required").max(100),
    tagline: z.string().max(200).optional(),
    bio: z.string().max(2000).optional(),
    avatar_url: z.string().url().optional().or(z.literal("")),
    cta_url: z.string().url().optional().or(z.literal("")),
    cta_label: z.string().max(50).optional(),
    cta_embed: z.string().optional(),
    social_links: z.array(socialLinkSchema).optional(),
    card_layout: z.enum(["classic", "bold"]).optional(),
});

// ─── Site Import ──────────────────────────────────────────────────────────────

export const siteImportSchema = z.object({
    domain: z
        .string()
        .min(1, "Domain is required")
        .regex(
            /^(https?:\/\/)?[\w.-]+\.[a-zA-Z]{2,}/,
            "Please enter a valid domain (e.g. example.com)",
        ),
    name: z.string().max(100).optional(),
});

// ─── SEO Settings ─────────────────────────────────────────────────────────────

export const seoSettingsSchema = z.object({
    seo_title: z.string().max(60, "Keep the title under 60 characters").optional(),
    seo_description: z.string().max(160, "Keep the description under 160 characters").optional(),
    og_image_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    twitter_handle: z
        .string()
        .regex(/^@?[\w]{1,15}$/, "Enter a valid Twitter handle")
        .optional()
        .or(z.literal("")),
});

// ─── API Connection ──────────────────────────────────────────────────────────

export const apiConnectionSchema = z.object({
    provider: z.enum(["openai", "anthropic", "google", "lemonade"]),
    api_key: z.string().min(1, "API key is required"),
    model_name: z.string().optional(),
});

// ─── Content Block ────────────────────────────────────────────────────────────

export const contentBlockSchema = z.object({
    heading: z.string().max(300).nullable(),
    body: z.string().nullable(),
    category: z.string().max(100).nullable(),
});
