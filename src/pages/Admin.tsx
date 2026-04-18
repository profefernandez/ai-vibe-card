import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient as db } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Site } from "@/types";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Loader2, LogOut, ExternalLink, Copy, Check } from "lucide-react";

import AdminSidebar, { type AdminSection } from "@/components/admin/AdminSidebar";
import SiteImportTab from "@/components/admin/SiteImportTab";
import ContentManagerTab from "@/components/admin/ContentManagerTab";
import ApiConnectorTab from "@/components/admin/ApiConnectorTab";
import AiTrainingTab from "@/components/admin/AiTrainingTab";
import ConnectionsTab from "@/components/admin/ConnectionsTab";
import ProfileTab from "@/components/admin/ProfileTab";
import SettingsTab from "@/components/admin/SettingsTab";

const sectionTitles: Record<AdminSection, string> = {
  import: "Site Import",
  content: "Content Manager",
  ai: "AI Training",
  cards: "Connections",
  api: "API Connectors",
  profile: "Profile / Card Info",
  settings: "Settings",
};

const Admin = () => {
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>("import");
  const [slug, setSlug] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  const handleSectionChange = (section: AdminSection) => {
    setActiveSection(section);
    // Move focus to main content area for screen readers
    setTimeout(() => mainRef.current?.focus(), 100);
  };

  useEffect(() => {
    if (!loading && !user && import.meta.env.PROD) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchSites().catch(() => {
        // API may be unavailable — admin still renders with empty data
      });
      fetchSlug().catch(() => { /* ignore */ });
    }
  }, [user]);

  // Re-fetch slug when user visits Connections (where slug is edited)
  useEffect(() => {
    if (user && activeSection === "cards") {
      fetchSlug().catch(() => { /* ignore */ });
    }
  }, [activeSection, user]);

  const fetchSites = async () => {
    const { data } = await db
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });
    setSites((data as Site[]) || []);
  };

  const fetchSlug = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from("profiles")
      .select("slug")
      .eq("user_id", user.id)
      .limit(1);
    const row = Array.isArray(data) && data[0] ? (data[0] as { slug?: string }) : null;
    setSlug(row?.slug ?? "");
  }, [user]);

  const cardUrl = slug ? `${window.location.origin}/card/${slug}` : "";

  const copyCardUrl = async () => {
    if (!cardUrl) return;
    try {
      await navigator.clipboard.writeText(cardUrl);
      setCopied(true);
      toast({ title: "Card URL copied" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const renderContent = () => {
    switch (activeSection) {
      case "import":
        return <SiteImportTab user={user} sites={sites} fetchSites={fetchSites} />;
      case "content":
        return <ContentManagerTab sites={sites} />;
      case "api":
        return <ApiConnectorTab user={user} />;
      case "ai":
        return <AiTrainingTab user={user} />;
      case "cards":
        return <ConnectionsTab user={user} />;
      case "profile":
        return <ProfileTab user={user} />;
      case "settings":
        return <SettingsTab user={user} />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-dark">
        {/* Skip to content link for keyboard users */}
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground"
        >
          Skip to main content
        </a>

        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          onBack={() => navigate("/")}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/30 px-4 gap-3" role="banner">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger aria-label="Toggle sidebar" />
              <h1 className="text-lg font-semibold text-foreground font-sans shrink-0">
                {sectionTitles[activeSection]}
              </h1>
            </div>

            {/* Card URL badge — primary public artifact the user needs */}
            <div className="flex-1 flex justify-center min-w-0">
              {slug ? (
                <div className="hidden sm:flex items-center gap-2 max-w-full px-3 py-1.5 rounded-full bg-secondary/60 border border-border/40">
                  <span className="text-xs text-muted-foreground shrink-0">Your card:</span>
                  <a
                    href={cardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary truncate hover:underline"
                    title={cardUrl}
                  >
                    {cardUrl.replace(/^https?:\/\//, "")}
                  </a>
                  <button
                    type="button"
                    onClick={copyCardUrl}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Copy card URL"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSectionChange("cards")}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  Set your card URL →
                </button>
              )}
            </div>

            <nav className="flex items-center gap-2 shrink-0" aria-label="Admin actions">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} aria-label="View business card">
                <ExternalLink className="w-4 h-4 mr-1" aria-hidden="true" /> View Card
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="w-4 h-4 mr-1" aria-hidden="true" /> Sign Out
              </Button>
            </nav>
          </header>

          <main
            id="admin-main"
            ref={mainRef}
            tabIndex={-1}
            className="flex-1 p-4 md:p-6 overflow-auto focus:outline-none"
            aria-label={sectionTitles[activeSection]}
            aria-live="polite"
          >
            {renderContent()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
