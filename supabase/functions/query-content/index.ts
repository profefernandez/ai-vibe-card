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
    const { query, site_id } = await req.json();
    if (!query) throw new Error("Query is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all content blocks for the site (or all sites if no site_id)
    let blocksQuery = supabase
      .from("content_blocks")
      .select("id, heading, body, images, category, tags, block_order, page_id")
      .order("block_order");

    if (site_id) {
      blocksQuery = blocksQuery.eq("site_id", site_id);
    }

    const { data: blocks, error } = await blocksQuery.limit(200);
    if (error) throw new Error(`DB error: ${error.message}`);
    if (!blocks || blocks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, blocks: [], message: "No content available yet" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to match query to content blocks
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Create a summary of blocks for the AI
    const blockSummaries = blocks.map((b, i) => 
      `[${i}] ${b.heading || "No heading"}: ${(b.body || "").slice(0, 200)}`
    ).join("\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a content routing AI. Given a user query and a list of content blocks from a website, return the indices of the 3-5 most relevant blocks that best answer the query. Return ONLY a JSON array of indices, e.g. [0, 3, 7]. If nothing is relevant, return [].`,
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nContent blocks:\n${blockSummaries}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse the AI response to get indices
    const jsonMatch = content.match(/\[[\d,\s]*\]/);
    const indices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Return the matched blocks
    const matchedBlocks = indices
      .filter((i: number) => i >= 0 && i < blocks.length)
      .map((i: number) => blocks[i]);

    return new Response(
      JSON.stringify({ success: true, blocks: matchedBlocks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("query-content error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
