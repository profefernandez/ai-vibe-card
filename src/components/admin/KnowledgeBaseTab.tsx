import { useState, useEffect, useMemo, useRef } from "react";
import { apiClient as db, type KbFolder, type KbItem } from "@/lib/apiClient";
import type { Site, ContentBlock } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Plus, Folder, FileText, Image as ImageIcon, FileType,
  ChevronDown, ChevronRight, Save, Upload, X,
} from "lucide-react";

interface KnowledgeBaseTabProps {
  sites: Site[];
}

const KnowledgeBaseTab = ({ sites }: KnowledgeBaseTabProps) => {
  const [folders, setFolders] = useState<KbFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<KbItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [showTextEditor, setShowTextEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<KbItem | null>(null);
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");

  const [uploading, setUploading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [scrapedExpanded, setScrapedExpanded] = useState(false);
  const [scrapedSiteId, setScrapedSiteId] = useState<string | null>(null);
  const [scrapedBlocks, setScrapedBlocks] = useState<ContentBlock[]>([]);

  const { toast } = useToast();

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId],
  );

  useEffect(() => {
    void loadFolders();
  }, []);

  useEffect(() => {
    if (activeFolderId) void loadItems(activeFolderId);
    else setItems([]);
  }, [activeFolderId]);

  useEffect(() => {
    if (!scrapedSiteId) { setScrapedBlocks([]); return; }
    void (async () => {
      const { data } = await db
        .from<ContentBlock>("content_blocks")
        .select("id, site_id, heading, body, category, tags, block_order")
        .eq("site_id", scrapedSiteId)
        .order("block_order");
      setScrapedBlocks((data as ContentBlock[]) || []);
    })();
  }, [scrapedSiteId]);

  const loadFolders = async () => {
    setLoading(true);
    const { data } = await db.kb.folders.list();
    setFolders(data);
    if (data.length > 0 && !activeFolderId) setActiveFolderId(data[0].id);
    setLoading(false);
  };

  const loadItems = async (folderId: string) => {
    const { data } = await db.kb.items.list(folderId);
    setItems(data);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    const { data, error } = await db.kb.folders.create({ name });
    setCreatingFolder(false);
    if (error || !data) {
      toast({ title: "Could not create folder", description: error?.message, variant: "destructive" });
      return;
    }
    setFolders((prev) => [...prev, data]);
    setActiveFolderId(data.id);
    setNewFolderName("");
  };

  const deleteFolder = async (id: string) => {
    if (!confirm("Delete this folder and everything in it?")) return;
    const { error } = await db.kb.folders.remove(id);
    if (error) {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (activeFolderId === id) setActiveFolderId(folders.find((f) => f.id !== id)?.id ?? null);
  };

  const openTextEditor = (item?: KbItem) => {
    if (item) {
      setEditingItem(item);
      setTextTitle(item.title || "");
      setTextBody(item.content || "");
    } else {
      setEditingItem(null);
      setTextTitle("");
      setTextBody("");
    }
    setShowTextEditor(true);
  };

  const saveText = async () => {
    if (!activeFolderId) return;
    const body = textBody.trim();
    if (!body) {
      toast({ title: "Content is empty", variant: "destructive" });
      return;
    }
    if (editingItem) {
      const { data, error } = await db.kb.items.update(editingItem.id, {
        title: textTitle.trim() || null,
        content: body,
      });
      if (error || !data) {
        toast({ title: "Save failed", description: error?.message, variant: "destructive" });
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    } else {
      const { data, error } = await db.kb.items.createText({
        folder_id: activeFolderId,
        title: textTitle.trim() || null,
        content: body,
      });
      if (error || !data) {
        toast({ title: "Save failed", description: error?.message, variant: "destructive" });
        return;
      }
      setItems((prev) => [...prev, data]);
    }
    setShowTextEditor(false);
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await db.kb.items.remove(id);
    if (error) {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file || !activeFolderId) return;
    setUploading(true);
    const { data, error } = await db.kb.items.upload(file, activeFolderId, { title: file.name });
    setUploading(false);
    if (error || !data) {
      toast({ title: "Upload failed", description: error?.message, variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, data]);
    toast({ title: data.type === "file" ? "PDF uploaded" : "Image uploaded" });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground">
          Everything your AI knows about you. Organize text notes, PDFs, and reference images into folders.
        </p>
      </div>

      {/* Folders bar */}
      <div className="rounded-xl border border-border/30 bg-card/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Folders</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFolderId(f.id)}
              className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                activeFolderId === f.id
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-secondary/40 border-border/30 text-foreground/80 hover:bg-secondary/70"
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>{f.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); void deleteFolder(f.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void deleteFolder(f.id); } }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                aria-label={`Delete folder ${f.name}`}
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
          {folders.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No folders yet — create your first one below.</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="bg-secondary/60 border-border/30 flex-1"
            onKeyDown={(e) => e.key === "Enter" && void createFolder()}
          />
          <Button size="sm" onClick={() => void createFolder()} disabled={creatingFolder || !newFolderName.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Folder
          </Button>
        </div>
      </div>

      {/* Items in active folder */}
      {activeFolder ? (
        <div className="rounded-xl border border-border/30 bg-card/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Folder className="w-4 h-4 text-primary" /> {activeFolder.name}
              <span className="text-xs text-muted-foreground font-normal">({items.length} items)</span>
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => openTextEditor()}>
                <FileText className="w-3.5 h-3.5 mr-1" /> Add text
              </Button>
              <Button size="sm" variant="secondary" onClick={() => pdfInputRef.current?.click()} disabled={uploading}>
                <FileType className="w-3.5 h-3.5 mr-1" /> Upload PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                <ImageIcon className="w-3.5 h-3.5 mr-1" /> Upload image
              </Button>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => { void handleFileUpload(e.target.files?.[0]); e.target.value = ""; }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => { void handleFileUpload(e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
          </div>

          {showTextEditor && (
            <div className="rounded-lg border border-primary/30 bg-secondary/30 p-3 space-y-2">
              <Input
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Title (optional)"
                className="bg-background/50 border-border/30 text-sm"
              />
              <Textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Type or paste anything you want the AI to know…"
                className="bg-background/50 border-border/30 text-sm min-h-[140px]"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setShowTextEditor(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void saveText()}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            </div>
          )}

          {uploading && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Upload className="w-3 h-3 animate-pulse" /> Uploading…
            </p>
          )}

          {items.length === 0 && !showTextEditor ? (
            <p className="text-sm text-muted-foreground italic py-4">
              Empty folder. Add text, upload a PDF, or upload an image.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => <ItemRow key={item.id} item={item} onEdit={openTextEditor} onDelete={deleteItem} />)}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Create a folder to start adding knowledge.</p>
      )}

      {/* Legacy scraped sites — kept visible until the scrape pipeline is migrated */}
      {sites.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card/30 overflow-hidden">
          <button
            onClick={() => setScrapedExpanded(!scrapedExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-card/50 transition-colors"
          >
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              {scrapedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Imported sites ({sites.length})
            </span>
            <span className="text-xs text-muted-foreground">read-only</span>
          </button>
          {scrapedExpanded && (
            <div className="border-t border-border/20 p-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => setScrapedSiteId(scrapedSiteId === site.id ? null : site.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      scrapedSiteId === site.id
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-secondary/40 border-border/30 text-foreground/80"
                    }`}
                  >
                    {site.name || site.domain}
                  </button>
                ))}
              </div>
              {scrapedSiteId && (
                <div className="space-y-2 pt-2 max-h-[400px] overflow-y-auto">
                  {scrapedBlocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No content blocks.</p>
                  ) : (
                    scrapedBlocks.map((b) => (
                      <div key={b.id} className="rounded-lg border border-border/20 bg-secondary/30 p-3">
                        {b.heading && <p className="text-sm font-medium text-foreground">{b.heading}</p>}
                        <p className="text-xs text-muted-foreground line-clamp-2">{b.body}</p>
                        {b.category && <span className="text-[10px] text-primary mt-1 inline-block">{b.category}</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: KbItem;
  onEdit: (item: KbItem) => void;
  onDelete: (id: string) => void;
}) {
  if (item.type === "image") {
    return (
      <div className="rounded-lg border border-border/20 bg-secondary/30 p-3 flex gap-3">
        <img src={item.url || ""} alt={item.title || "image"} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.title || "Image"}</p>
          {item.caption && <p className="text-xs text-muted-foreground line-clamp-2">{item.caption}</p>}
          <p className="text-[10px] text-muted-foreground/70 mt-1">{item.mime_type}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }
  if (item.type === "file") {
    return (
      <div className="rounded-lg border border-border/20 bg-secondary/30 p-3 flex items-center gap-3">
        <FileType className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <a href={item.url || "#"} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:underline truncate block">
            {item.title || "File"}
          </a>
          <p className="text-[10px] text-muted-foreground/70">
            {item.mime_type}
            {item.file_size ? ` · ${Math.round(item.file_size / 1024)} KB` : ""}
            {item.content ? " · text extracted" : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }
  // text
  return (
    <div
      className="rounded-lg border border-border/20 bg-secondary/30 p-3 flex gap-3 cursor-pointer hover:border-primary/30"
      onClick={() => onEdit(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(item); } }}
    >
      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {item.title && <p className="text-sm font-medium text-foreground truncate">{item.title}</p>}
        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{item.content}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default KnowledgeBaseTab;
