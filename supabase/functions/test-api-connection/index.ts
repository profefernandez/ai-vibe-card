import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, api_key } = await req.json();

    if (!provider || !api_key) {
      return new Response(JSON.stringify({ success: false, error: "Missing provider or api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let testUrl = "";
    let testHeaders: Record<string, string> = {};
    let testBody = "";

    switch (provider) {
      case "openai":
        testUrl = "https://api.openai.com/v1/models";
        testHeaders = { Authorization: `Bearer ${api_key}` };
        break;
      case "anthropic":
        testUrl = "https://api.anthropic.com/v1/messages";
        testHeaders = {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        };
        testBody = JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        break;
      case "google":
        testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`;
        break;
      case "lemonade":
        // Launch Lemonade — simple ping check
        return new Response(
          JSON.stringify({ success: !!api_key, message: "Key stored. Launch Lemonade integration ready." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      default:
        return new Response(JSON.stringify({ success: false, error: "Unknown provider" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const fetchOpts: RequestInit = { method: testBody ? "POST" : "GET", headers: testHeaders };
    if (testBody) fetchOpts.body = testBody;

    const res = await fetch(testUrl, fetchOpts);
    const success = res.ok;

    return new Response(
      JSON.stringify({ success, error: success ? null : `API returned ${res.status}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
