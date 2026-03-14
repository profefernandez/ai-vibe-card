import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!
    ).auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { domain, site_id } = await req.json();
    if (!domain) throw new Error("Domain is required");

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) throw new Error("Firecrawl connector not configured");

    // Format URL
    let formattedUrl = domain.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Update site status to scraping
    await supabase.from("sites").update({ scrape_status: "scraping" }).eq("id", site_id);

    console.log("Crawling:", formattedUrl);

    // Use Firecrawl to crawl the site
    const crawlResponse = await fetch("https://api.firecrawl.dev/v1/crawl", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: 20,
        scrapeOptions: { formats: ["markdown", "html"] },
      }),
    });

    const crawlData = await crawlResponse.json();
    if (!crawlResponse.ok) {
      console.error("Firecrawl error:", crawlData);
      await supabase.from("sites").update({ scrape_status: "error" }).eq("id", site_id);
      throw new Error(crawlData.error || "Crawl failed");
    }

    // Firecrawl crawl is async - we get a job ID back
    const jobId = crawlData.id;
    if (!jobId) {
      // If data came back directly (unlikely for crawl), process it
      await supabase.from("sites").update({ scrape_status: "error" }).eq("id", site_id);
      throw new Error("No crawl job ID returned");
    }

    // Poll for results (max 60s)
    let results = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusResp.json();

      if (statusData.status === "completed") {
        results = statusData.data;
        break;
      } else if (statusData.status === "failed") {
        await supabase.from("sites").update({ scrape_status: "error" }).eq("id", site_id);
        throw new Error("Crawl job failed");
      }
    }

    if (!results || results.length === 0) {
      await supabase.from("sites").update({ scrape_status: "error" }).eq("id", site_id);
      throw new Error("Crawl timed out or returned no results");
    }

    console.log(`Got ${results.length} pages`);

    // Store pages and parse content blocks
    let totalBlocks = 0;
    for (const page of results) {
      const pageUrl = page.metadata?.sourceURL || page.url || formattedUrl;
      const pageTitle = page.metadata?.title || "Untitled";
      const markdown = page.markdown || "";
      const html = page.html || "";

      // Insert page
      const { data: pageData, error: pageError } = await supabase
        .from("site_pages")
        .insert({
          site_id,
          url: pageUrl,
          title: pageTitle,
          markdown,
          html,
          metadata: page.metadata || {},
        })
        .select("id")
        .single();

      if (pageError) {
        console.error("Error inserting page:", pageError);
        continue;
      }

      // Parse markdown into content blocks by splitting on headings
      const blocks = parseMarkdownToBlocks(markdown);
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        await supabase.from("content_blocks").insert({
          site_id,
          page_id: pageData.id,
          heading: block.heading,
          body: block.body,
          images: block.images,
          category: block.category,
          block_order: i,
        });
        totalBlocks++;
      }
    }

    // Update site status
    await supabase
      .from("sites")
      .update({
        scrape_status: "completed",
        page_count: results.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", site_id);

    return new Response(
      JSON.stringify({
        success: true,
        pages: results.length,
        blocks: totalBlocks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scrape-site error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseMarkdownToBlocks(markdown: string) {
  const blocks: { heading: string; body: string; images: string[]; category: string }[] = [];
  if (!markdown.trim()) return blocks;

  // Split by headings (h1, h2, h3)
  const sections = markdown.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    const heading = headingMatch ? headingMatch[2].trim() : "";
    const body = headingMatch ? trimmed.slice(headingMatch[0].length).trim() : trimmed;

    // Extract image URLs
    const imageRegex = /!\[.*?\]\((.*?)\)/g;
    const images: string[] = [];
    let match;
    while ((match = imageRegex.exec(body)) !== null) {
      images.push(match[1]);
    }

    // Determine category from heading level
    const level = headingMatch ? headingMatch[1].length : 0;
    const category = level === 1 ? "hero" : level === 2 ? "section" : "subsection";

    if (body || heading) {
      blocks.push({ heading, body, images, category });
    }
  }

  return blocks;
}
