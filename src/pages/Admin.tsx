import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Globe, Loader2, CheckCircle, XCircle, LogOut, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

type Site = {
  id: string;
  domain: string;
  name: string | null;
  scrape_status: string;
  page_count: number;
  created_at: string;
};

type ContentBlock = {
  id: string;
  heading: string | null;
  body: string | null;
  images: string[];
  category: string | null;
  block_order: number;
};

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [domain, setDomain] = useState("");
  const [siteName, setSiteName] = useState("");
  const [scraping, setScraping] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) fetchSites();
  }, [user]);

  useEffect(() => {
    if (selectedSite) fetchBlocks(selectedSite);
  }, [selectedSite]);

  const fetchSites = async () => {
    const { data } = await supabase
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });
    setSites((data as Site[]) || []);
  };

  const fetchBlocks = async (siteId: string) => {
    const { data } = await supabase
      .from("content_blocks")
      .select("*")
      .eq("site_id", siteId)
      .order("block_order");
    setBlocks((data as ContentBlock[]) || []);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim() || !user) return;
    setScraping(true);

    try {
      // Create site record
      const { data: site, error: siteError } = await supabase
        .from("sites")
        .insert({ domain: domain.trim(), name: siteName.trim() || domain.trim(), user_id: user.id })
        .select()
        .single();

      if (siteError) throw siteError;

      toast({ title: "Scraping started", description: `Importing ${domain}...` });
      fetchSites();

      // Call scrape edge function
      const { data, error } = await supabase.functions.invoke("scrape-site", {
        body: { domain: domain.trim(), site_id: (site as Site).id },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({ title: "Import complete!", description: `${data.pages} pages, ${data.blocks} content blocks imported.` });
      setDomain("");
      setSiteName("");
      fetchSites();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      fetchSites();
    } finally {
      setScraping(false);
    }
  };

  const deleteSite = async (siteId: string) => {
    await supabase.from("sites").delete().eq("id", siteId);
    if (selectedSite === siteId) {
      setSelectedSite(null);
      setBlocks([]);
    }
    fetchSites();
    toast({ title: "Site deleted" });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) return <div className="min-h-screen bg-gradient-dark flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-gradient-dark px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </Button>
        </div>

        {/* Import form */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" /> Import Website
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter a domain to scrape and import its content. The AI will use this to answer visitor queries.
          </p>
          <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Site name (optional)"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="bg-secondary/60 border-border/30 sm:w-48"
            />
            <Input
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              className="bg-secondary/60 border-border/30 flex-1"
            />
            <Button type="submit" disabled={scraping || !domain.trim()}>
              {scraping ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Scraping...</> : "Import Site"}
            </Button>
          </form>
        </div>

        {/* Sites list */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Imported Sites</h2>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sites imported yet.</p>
          ) : (
            <div className="space-y-2">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all ${
                    selectedSite === site.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/30 bg-card/30 hover:bg-card/50"
                  }`}
                  onClick={() => setSelectedSite(selectedSite === site.id ? null : site.id)}
                >
                  <div className="flex items-center gap-3">
                    {site.scrape_status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : site.scrape_status === "scraping" ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : site.scrape_status === "error" ? (
                      <XCircle className="w-5 h-5 text-destructive" />
                    ) : (
                      <Globe className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{site.name || site.domain}</p>
                      <p className="text-xs text-muted-foreground">{site.domain} · {site.page_count} pages</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); deleteSite(site.id); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content blocks preview */}
        {selectedSite && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Content Blocks ({blocks.length})</h2>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content blocks yet. Site may still be processing.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {blocks.map((block) => (
                  <div key={block.id} className="rounded-xl border border-border/20 bg-card/20 p-4">
                    {block.heading && (
                      <p className="text-sm font-semibold text-foreground mb-1">{block.heading}</p>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-3">{block.body}</p>
                    {block.images.length > 0 && (
                      <p className="text-xs text-primary mt-1">{block.images.length} image(s)</p>
                    )}
                    <span className="text-[10px] text-muted-foreground/50 mt-1 inline-block">{block.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
