/**
 * CardView render test — exercises the Profile-prop path of the public card.
 *
 * No network: CardView takes a `profile` prop directly (the API fetch happens
 * one level up in CardShare). We pass a fixture and assert the user-visible
 * primary fields (name, tagline substring, avatar) render in the document.
 *
 * `applyMeta={false}` skips the document.title / meta tag side effects so
 * jsdom doesn't fight with vitest's globals.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CardView from "./CardView";
import type { Profile } from "@/types";

const fixture: Profile = {
    display_name: "Tanya Williams",
    tagline: "Founder & AI Consultant",
    bio: "Test bio about ethical AI tooling for social workers.",
    avatar_url: "https://example.test/avatar.jpg",
    cta_url: "https://example.test/book",
    cta_label: "Book a call",
    cta_embed: "",
    social_links: [],
    card_layout: "classic",
    theme: "dark",
    accent_color: "amber",
    seo_title: "Tanya Williams",
    seo_description: "Public card",
    og_image_url: "",
    twitter_handle: "",
    robots_txt: null,
    slug: "tanya",
    ai_query_enabled: false,
    show_qr_scan_link: false,
};

describe("CardView", () => {
    it("renders the profile display_name, tagline, and bio", () => {
        render(
            <MemoryRouter>
                <CardView profile={fixture} applyMeta={false} />
            </MemoryRouter>,
        );

        // display_name and tagline are rendered as plain text.
        expect(screen.getByText(fixture.display_name)).toBeInTheDocument();
        expect(screen.getByText(fixture.tagline)).toBeInTheDocument();

        // Bio is split on \n into <span> children inside a single <p>; assert
        // a stable substring exists somewhere in the document.
        expect(
            screen.getByText(/ethical AI tooling for social workers/),
        ).toBeInTheDocument();
    });

    it("renders an avatar img with the provided avatar_url", () => {
        render(
            <MemoryRouter>
                <CardView profile={fixture} applyMeta={false} />
            </MemoryRouter>,
        );

        // The classic layout renders one avatar img with alt = "<name> — <tagline>".
        const img = screen.getByAltText(
            `${fixture.display_name} — ${fixture.tagline}`,
        ) as HTMLImageElement;
        expect(img).toBeInTheDocument();
        expect(img.src).toBe(fixture.avatar_url);
    });
});
