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

// ─── Admin-driven card theme tokens ──────────────────────────────────────────

export const cardThemeModeSchema = z.enum(["light", "dark", "auto"]);
export const cardThemeFontSchema = z.enum(["inter", "playfair", "system-sans", "system-serif", "mono"]);
export const cardThemeScaleSchema = z.enum(["compact", "comfortable", "spacious"]);
export const cardThemeWeightHeadingSchema = z.enum(["400", "500", "600", "700", "800"]);
export const cardThemeWeightBodySchema = z.enum(["300", "400", "500", "600"]);
export const cardThemeLetterSpacingSchema = z.enum(["tight", "normal", "wide"]);
export const cardThemeLineHeightSchema = z.enum(["compact", "normal", "relaxed"]);
export const cardThemeRadiusSchema = z.enum(["sm", "md", "lg", "xl", "full"]);
export const cardThemeShadowSchema = z.enum(["none", "soft", "lifted", "dramatic"]);
export const cardThemeBorderWidthSchema = z.enum(["none", "hairline", "thin", "medium"]);
export const cardThemeDensitySchema = z.enum(["cozy", "standard", "airy"]);
export const cardThemeHeroVariantSchema = z.enum(["slider", "photo-stage", "minimal", "split"]);
export const cardThemeSectionIdSchema = z.enum([
    "identity",
    "hero",
    "gallery",
    "services",
    "social-links",
    "cta",
    "ai-concierge",
    "footer",
]);
export const cardThemeContainerWidthSchema = z.enum(["narrow", "standard", "wide", "full"]);
export const cardThemeMotionLevelSchema = z.enum(["none", "subtle", "expressive"]);
export const cardThemePhotoShapeSchema = z.enum(["circle", "squircle", "rounded-rect"]);
export const cardThemePhotoFrameSchema = z.enum(["none", "ring", "glow"]);

const cssColorSchema = z
    .string()
    .trim()
    .regex(
        /^(#[0-9a-f]{3,8}|(?:hsl|rgb)a?\([^)]+\)|[a-z][a-z0-9-]*)$/i,
        "Use a hex, rgb(), hsl(), or curated color slug",
    );

const orderedSectionSchema = z
    .array(cardThemeSectionIdSchema)
    .min(1, "At least one section is required")
    .superRefine((sections, ctx) => {
        const seen = new Set<string>();
        sections.forEach((section, index) => {
            if (seen.has(section)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate section: ${section}`,
                    path: [index],
                });
            }
            seen.add(section);
        });
    });

export const cardThemeSchema = z.object({
    version: z.literal(1).default(1),
    color: z.object({
        mode: cardThemeModeSchema,
        accent: cssColorSchema,
        cardBackground: cssColorSchema,
        cardForeground: cssColorSchema,
        mutedText: cssColorSchema,
        borderColor: cssColorSchema,
        linkColor: cssColorSchema,
        gradientStops: z.array(cssColorSchema).min(2).max(4).optional(),
    }),
    typography: z.object({
        fontHeading: cardThemeFontSchema,
        fontBody: cardThemeFontSchema,
        fontMono: cardThemeFontSchema,
        scale: cardThemeScaleSchema,
        weightHeading: cardThemeWeightHeadingSchema,
        weightBody: cardThemeWeightBodySchema,
        letterSpacing: cardThemeLetterSpacingSchema,
        lineHeight: cardThemeLineHeightSchema,
    }),
    shape: z.object({
        radius: cardThemeRadiusSchema,
        shadow: cardThemeShadowSchema,
        borderWidth: cardThemeBorderWidthSchema,
    }),
    layout: z.object({
        density: cardThemeDensitySchema,
        heroVariant: cardThemeHeroVariantSchema,
        sectionOrder: orderedSectionSchema,
        mobileSectionOrder: orderedSectionSchema,
        containerWidth: cardThemeContainerWidthSchema,
    }),
    motion: z.object({
        motionLevel: cardThemeMotionLevelSchema,
    }),
    imagery: z.object({
        photoShape: cardThemePhotoShapeSchema,
        photoFrame: cardThemePhotoFrameSchema,
    }),
});

export type CardTheme = z.infer<typeof cardThemeSchema>;
export type CardThemeSectionId = z.infer<typeof cardThemeSectionIdSchema>;

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
