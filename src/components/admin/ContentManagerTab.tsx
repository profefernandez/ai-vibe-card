import { useState, useEffect } from "react";
import { apiClient as db } from "@/lib/apiClient";
import type { Site, ContentBlock } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, ChevronDown, ChevronRight } from "lucide-react";

const ContentManagerTab = ({ sites }: { sites: Site[] }) => {
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ContentBlock>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (expandedSite) fetchBlocks(expandedSite);
  }, [expandedSite]);

  const fetchBlocks = async (siteId: string) => {
    const { data } = await db
      .from("content_blocks")
      .select("id, site_id, heading, body, category, tags, block_order")
      .eq("site_id", siteId)
      .order("block_order");
    setBlocks((data as ContentBlock[]) || []);
  };

  const startEdit = (block: ContentBlock) => {
    setEditingBlock(block.id);
    setEditValues({ heading: block.heading, body: block.body, category: block.category });
  };

  const saveEdit = async (blockId: string) => {
    const { error } = await db
      .from("content_blocks")
      .update({ heading: editValues.heading, body: editValues.body, category: editValues.category })
      .eq("id", blockId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Block updated" });
      setEditingBlock(null);
      if (expandedSite) fetchBlocks(expandedSite);
    }
  };

  const deleteBlock = async (blockId: string) => {
    await db.from("content_blocks").delete().eq("id", blockId);
    toast({ title: "Block deleted" });
    if (expandedSite) fetchBlocks(expandedSite);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Content Manager</h2>
      <p className="text-sm text-muted-foreground">Edit, tag, or delete imported content blocks.</p>

      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">Import a site first to manage content.</p>
      ) : (
        <div className="space-y-2">
          {sites.map((site) => (
            <div key={site.id} className="rounded-xl border border-border/30 bg-card/30 overflow-hidden">
              <button
                onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-card/50 transition-colors"
                aria-expanded={expandedSite === site.id}
                aria-controls={`site-content-${site.id}`}
              >
                <span className="text-sm font-medium text-foreground">{site.name || site.domain}</span>
                {expandedSite === site.id ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                )}
              </button>

              {expandedSite === site.id && (
                <div id={`site-content-${site.id}`} className="border-t border-border/20 p-4 space-y-3 max-h-[500px] overflow-y-auto">
                  {blocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No content blocks.</p>
                  ) : (
                    blocks.map((block) => (
                      <div key={block.id} className="rounded-lg border border-border/20 bg-secondary/30 p-3 space-y-2">
                        {editingBlock === block.id ? (
                          <>
                            <Input
                              value={editValues.heading || ""}
                              onChange={(e) => setEditValues({ ...editValues, heading: e.target.value })}
                              placeholder="Heading"
                              aria-label="Block heading"
                              className="bg-secondary/60 border-border/30 text-sm"
                            />
                            <Textarea
                              value={editValues.body || ""}
                              onChange={(e) => setEditValues({ ...editValues, body: e.target.value })}
                              placeholder="Body"
                              aria-label="Block body"
                              className="bg-secondary/60 border-border/30 text-xs min-h-[60px]"
                            />
                            <Input
                              value={editValues.category || ""}
                              onChange={(e) => setEditValues({ ...editValues, category: e.target.value })}
                              placeholder="Category"
                              aria-label="Block category"
                              className="bg-secondary/60 border-border/30 text-sm"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEdit(block.id)}>
                                <Save className="w-3 h-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingBlock(null)}>Cancel</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start justify-between">
                              <div
                                className="flex-1 cursor-pointer"
                                role="button"
                                tabIndex={0}
                                onClick={() => startEdit(block)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(block); } }}
                                aria-label={`Edit block: ${block.heading || "Untitled"}`}
                              >
                                {block.heading && <p className="text-sm font-medium text-foreground">{block.heading}</p>}
                                <p className="text-xs text-muted-foreground line-clamp-2">{block.body}</p>
                                {block.category && (
                                  <span className="text-[10px] text-primary mt-1 inline-block">{block.category}</span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => deleteBlock(block.id)}
                                aria-label={`Delete block: ${block.heading || "Untitled"}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentManagerTab;
