import { useState } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { User, Site, ContentBlock } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Globe, Loader2, CheckCircle, XCircle, Trash2, RefreshCw, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import { timeAgo } from "@/lib/formatters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const { toast } = useToast();

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

      toast({
        title: "Site added",
        description: "Verify domain ownership before importing content.",
      });
      setDomain("");
      setSiteName("");
      setSelectedSite((site as Site).id);
      fetchSites();
    } catch (err: any) {
      toast({ title: "Failed to add site", description: err.message, variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const handleVerify = async (siteId: string, method: "dns_txt" | "meta_tag") => {
    setVerifyingId(siteId);
    try {
      const { data, error } = await db.functions.invoke("verify-domain", {
        body: { site_id: siteId, method },
      });
      if (error) throw error;
      const result = data as { success: boolean; detail?: string; already_verified?: boolean };
      if (result.success) {
        toast({ title: "Domain verified!", description: result.detail || "You can now import content." });
        fetchSites();
      } else {
        toast({ title: "Verification failed", description: result.detail || "Check your setup and try again.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Verification error", description: err.message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleScrape = async (siteId: string, siteDomain: string) => {
    setRescrapingId(siteId);
    try {
      toast({ title: "Scraping started", description: `Importing ${siteDomain}...` });
      const { data, error } = await db.functions.invoke("scrape-site", {
        body: { domain: siteDomain, site_id: siteId },
      });
      if (error) throw error;
      const result = data as { success: boolean; pages?: number; blocks?: number; error?: string };
      if (!result.success) throw new Error(result.error);
      toast({ title: "Import complete!", description: `${result.pages} pages, ${result.blocks} content blocks imported.` });
      fetchSites();
      if (selectedSite === siteId) fetchBlocks(siteId);
    } catch (err: any) {
      toast({ title: "Scrape failed", description: err.message, variant: "destructive" });
      fetchSites();
    } finally {
      setRescrapingId(null);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const selectedSiteData = sites.find((s) => s.id === selectedSite);

  return (
    <div className="space-y-6">
      {/* Import form */}
      <div className="rounded-2xl border border-border/30 bg-card/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" /> Import Website
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter a domain to import. You'll need to verify ownership before content is scraped.
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
            {scraping ? <><Loader2 className="w-4 h-4 animate-spin mr-1" aria-hidden="true" /> Adding...</> : "Add Site"}
          </Button>
        </form>
      </div>

      {/* Verification panel for selected unverified site */}
      {selectedSiteData && !selectedSiteData.verified && selectedSiteData.verification_token && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" /> Verify Domain Ownership
          </h2>
          <p className="text-sm text-muted-foreground">
            Prove you own <strong>{selectedSiteData.domain}</strong> using one of these methods. Verification is required before importing content.
          </p>

          <Tabs defaultValue="dns_txt" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dns_txt">DNS TXT Record</TabsTrigger>
              <TabsTrigger value="meta_tag">HTML Meta Tag</TabsTrigger>
            </TabsList>
            <TabsContent value="dns_txt" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">
                Add a TXT record to your domain's DNS settings:
              </p>
              <div className="rounded-lg bg-secondary/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Host/Name</p>
                    <code className="text-sm text-foreground">_60watt-verify</code>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard("_60watt-verify")} aria-label="Copy host">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Value</p>
                    <code className="text-sm text-foreground break-all">{selectedSiteData.verification_token}</code>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(selectedSiteData.verification_token!)} aria-label="Copy token">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Type: TXT &middot; TTL: 300 (or default)</p>
              </div>
              <Button
                onClick={() => handleVerify(selectedSiteData.id, "dns_txt")}
                disabled={verifyingId === selectedSiteData.id}
              >
                {verifyingId === selectedSiteData.id
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Checking...</>
                  : "Check DNS Verification"}
              </Button>
            </TabsContent>
            <TabsContent value="meta_tag" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">
                Add this meta tag to the <code>&lt;head&gt;</code> of your homepage:
              </p>
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-foreground break-all">
                    {`<meta name="60watt-verify" content="${selectedSiteData.verification_token}" />`}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(`<meta name="60watt-verify" content="${selectedSiteData.verification_token}" />`)}
                    aria-label="Copy meta tag"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <Button
                onClick={() => handleVerify(selectedSiteData.id, "meta_tag")}
                disabled={verifyingId === selectedSiteData.id}
              >
                {verifyingId === selectedSiteData.id
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Checking...</>
                  : "Check Meta Tag Verification"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      )}

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
                aria-label={`${site.name || site.domain}, ${site.page_count} pages, status: ${site.scrape_status}, ${site.verified ? "verified" : "unverified"}`}
                onClick={() => {
                  const next = selectedSite === site.id ? null : site.id;
                  setSelectedSite(next);
                  if (next && site.verified) fetchBlocks(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const next = selectedSite === site.id ? null : site.id;
                    setSelectedSite(next);
                    if (next && site.verified) fetchBlocks(next);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {!site.verified ? (
                    <><ShieldAlert className="w-5 h-5 text-amber-500" aria-hidden="true" /><span className="sr-only">Status: unverified</span></>
                  ) : site.scrape_status === "completed" ? (
                    <><CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" /><span className="sr-only">Status: completed</span></>
                  ) : site.scrape_status === "scraping" ? (
                    <><Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Status: scraping</span></>
                  ) : site.scrape_status === "error" ? (
                    <><XCircle className="w-5 h-5 text-destructive" aria-hidden="true" /><span className="sr-only">Status: error</span></>
                  ) : (
                    <><Globe className="w-5 h-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Status: pending</span></>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      {site.name || site.domain}
                      {site.verified && <ShieldCheck className="w-3.5 h-3.5 text-green-500" aria-label="Verified" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {site.domain} · {site.verified ? `${site.page_count} pages · Scraped ${timeAgo(site.last_scraped_at)}` : "Awaiting verification"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {site.verified && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleScrape(site.id, site.domain); }}
                      disabled={rescrapingId === site.id}
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`${site.page_count > 0 ? "Re-scrape" : "Scrape"} ${site.name || site.domain}`}
                    >
                      <RefreshCw className={`w-4 h-4 ${rescrapingId === site.id ? "animate-spin" : ""}`} />
                    </Button>
                  )}
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
      {selectedSite && selectedSiteData?.verified && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Content Blocks ({blocks.length})</h2>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No content blocks yet. Click the refresh button to scrape the site.</p>
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
