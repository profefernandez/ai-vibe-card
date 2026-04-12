import { useState } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Globe, Loader2, CheckCircle, XCircle, Trash2, RefreshCw } from "lucide-react";

type Site = {
  id: string;
  domain: string;
  name: string | null;
  scrape_status: string;
  page_count: number;
  share_usage_limit: number;
  last_scraped_at: string | null;
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

interface SiteImportTabProps {
  user: User;
  sites: Site[];
  fetchSites: () => void;
}

const SiteImportTab = ({ user, sites, fetchSites }: SiteImportTabProps) => {
  const [domain, setDomain] = useState("");
  const [siteName, setSiteName] = useState("");
  const [scraping, setScraping] = useState(false);
  const [rescrapingId, setRescrapingId] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const { toast } = useToast();

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fetchBlocks = async (siteId: string) => {
    const { data } = await db
      .from("content_blocks")
      .select("*")
      .eq("site_id", siteId)
      .order("block_order");
    setBlocks((data as ContentBlock[]) || []);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setScraping(true);

    try {
      const { data: site, error: siteError } = await db
        .from("sites")
        .insert({ domain: domain.trim(), name: siteName.trim() || domain.trim(), user_id: user.id })
        .select()
        .single();

      if (siteError) throw siteError;

      toast({ title: "Scraping started", description: `Importing ${domain}...` });
      fetchSites();

      const { data, error } = await db.functions.invoke("scrape-site", {
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
    await db.from("sites").delete().eq("id", siteId);
    if (selectedSite === siteId) {
      setSelectedSite(null);
      setBlocks([]);
    }
    fetchSites();
    toast({ title: "Site deleted" });
  };

  const handleRescrape = async (siteId: string, siteDomain: string) => {
    setRescrapingId(siteId);
    try {
      toast({ title: "Re-scraping started", description: `Refreshing ${siteDomain}...` });
      const { data, error } = await db.functions.invoke("scrape-site", {
        body: { domain: siteDomain, site_id: siteId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast({ title: "Re-scrape complete!", description: `${data.pages} pages, ${data.blocks} content blocks refreshed.` });
      fetchSites();
      if (selectedSite === siteId) fetchBlocks(siteId);
    } catch (err: any) {
      toast({ title: "Re-scrape failed", description: err.message, variant: "destructive" });
      fetchSites();
    } finally {
      setRescrapingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Import form */}
      <div className="rounded-2xl border border-border/30 bg-card/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" /> Import Website
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter a domain to scrape and import its content. The AI will use this to answer visitor queries.
        </p>
        <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3">
          <div>
            <label htmlFor="site-name" className="sr-only">Site name</label>
            <Input
              id="site-name"
              placeholder="Site name (optional)"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="bg-secondary/60 border-border/30 sm:w-48"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="site-domain" className="sr-only">Domain</label>
            <Input
              id="site-domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              className="bg-secondary/60 border-border/30"
            />
          </div>
          <Button type="submit" disabled={scraping || !domain.trim()}>
            {scraping ? <><Loader2 className="w-4 h-4 animate-spin mr-1" aria-hidden="true" /> Scraping...</> : "Import Site"}
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
                role="button"
                tabIndex={0}
                className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all ${selectedSite === site.id
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/30 bg-card/30 hover:bg-card/50"
                  }`}
                aria-pressed={selectedSite === site.id}
                aria-label={`${site.name || site.domain}, ${site.page_count} pages, status: ${site.scrape_status}`}
                onClick={() => {
                  const next = selectedSite === site.id ? null : site.id;
                  setSelectedSite(next);
                  if (next) fetchBlocks(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const next = selectedSite === site.id ? null : site.id;
                    setSelectedSite(next);
                    if (next) fetchBlocks(next);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {site.scrape_status === "completed" ? (
                    <><CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" /><span className="sr-only">Status: completed</span></>
                  ) : site.scrape_status === "scraping" ? (
                    <><Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Status: scraping</span></>
                  ) : site.scrape_status === "error" ? (
                    <><XCircle className="w-5 h-5 text-destructive" aria-hidden="true" /><span className="sr-only">Status: error</span></>
                  ) : (
                    <><Globe className="w-5 h-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Status: pending</span></>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{site.name || site.domain}</p>
                    <p className="text-xs text-muted-foreground">{site.domain} · {site.page_count} pages · Scraped {timeAgo(site.last_scraped_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleRescrape(site.id, site.domain); }}
                    disabled={rescrapingId === site.id}
                    className="text-muted-foreground hover:text-primary"
                    aria-label={`Re-scrape ${site.name || site.domain}`}
                  >
                    <RefreshCw className={`w-4 h-4 ${rescrapingId === site.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); deleteSite(site.id); }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${site.name || site.domain}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
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
  );
};

export default SiteImportTab;
