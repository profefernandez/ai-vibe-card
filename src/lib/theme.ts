/**
 * Theme + accent color runtime application.
 * Applies CSS custom properties to the document root so Tailwind picks them up.
 */

export type CardFontFamily = "inter" | "hybrid" | "playfair";

export const CARD_FONT_PRESETS: Record<CardFontFamily, { label: string; sans: string; display: string }> = {
    inter: {
        label: "Inter",
        sans: "'Inter', sans-serif",
        display: "'Inter', sans-serif",
    },
    hybrid: {
        label: "Editorial",
        sans: "'Inter', sans-serif",
        display: "'Playfair Display', serif",
    },
    playfair: {
        label: "Playfair",
        sans: "'Playfair Display', serif",
        display: "'Playfair Display', serif",
    },
};

export const ACCENT_HSL: Record<string, { primary: string; accent: string; ring: string; glow: string; soft: string }> = {
    amber: { primary: "38 95% 50%", accent: "38 80% 45%", ring: "38 95% 50%", glow: "38 95% 50%", soft: "38 60% 30%" },
    blue: { primary: "217 91% 60%", accent: "217 80% 50%", ring: "217 91% 60%", glow: "217 91% 60%", soft: "217 50% 30%" },
    green: { primary: "142 71% 45%", accent: "142 60% 40%", ring: "142 71% 45%", glow: "142 71% 45%", soft: "142 40% 25%" },
    purple: { primary: "262 83% 58%", accent: "262 70% 50%", ring: "262 83% 58%", glow: "262 83% 58%", soft: "262 50% 30%" },
    rose: { primary: "347 77% 50%", accent: "347 65% 45%", ring: "347 77% 50%", glow: "347 77% 50%", soft: "347 45% 28%" },
    teal: { primary: "172 66% 50%", accent: "172 55% 42%", ring: "172 66% 50%", glow: "172 66% 50%", soft: "172 40% 25%" },
    orange: { primary: "25 95% 53%", accent: "25 85% 45%", ring: "25 95% 53%", glow: "25 95% 53%", soft: "25 55% 28%" },
    cyan: { primary: "189 94% 43%", accent: "189 80% 38%", ring: "189 94% 43%", glow: "189 94% 43%", soft: "189 50% 25%" },
};

export function applyTheme(theme: string, accentColor: string) {
    const root = document.documentElement;

    // ── Theme (dark / light / system) ────────────────────────────────────────
    if (theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", prefersDark);
        root.classList.toggle("light", !prefersDark);
    } else {
        root.classList.toggle("dark", theme === "dark");
        root.classList.toggle("light", theme === "light");
    }

    // ── Accent color ────────────────────────────────────────────────────────
    const palette = ACCENT_HSL[accentColor] ?? ACCENT_HSL.amber;
    root.style.setProperty("--primary", palette.primary);
    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--ring", palette.ring);
    root.style.setProperty("--amber-glow", palette.glow);
    root.style.setProperty("--amber-soft", palette.soft);
    root.style.setProperty("--sidebar-primary", palette.primary);
    root.style.setProperty("--sidebar-ring", palette.ring);
}

export function getCardTypographyStyles(fontFamily?: string): Record<string, string> {
    const preset = CARD_FONT_PRESETS[(fontFamily as CardFontFamily) || "hybrid"] ?? CARD_FONT_PRESETS.hybrid;
    return {
        "--card-font-sans": preset.sans,
        "--card-font-display": preset.display,
    };
}
