import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient as db } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import type { Site } from "@/types";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Loader2, LogOut, ExternalLink } from "lucide-react";

import AdminSidebar, { type AdminSection } from "@/components/admin/AdminSidebar";
import SiteImportTab from "@/components/admin/SiteImportTab";
import ContentManagerTab from "@/components/admin/ContentManagerTab";
import ApiConnectorTab from "@/components/admin/ApiConnectorTab";
import AiTrainingTab from "@/components/admin/AiTrainingTab";
import ReceivedCardsTab from "@/components/admin/ReceivedCardsTab";
import ProfileTab from "@/components/admin/ProfileTab";
import SettingsTab from "@/components/admin/SettingsTab";

const sectionTitles: Record<AdminSection, string> = {
  import: "Site Import",
  content: "Content Manager",
  ai: "AI Training",
  cards: "Received Cards",
  api: "API Connectors",
  profile: "Profile / Card Info",
  settings: "Settings",
};

const Admin = () => {
  const { user, loading, signOut } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>("import");
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
    }
  }, [user]);

  const fetchSites = async () => {
    const { data } = await db
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });
    setSites((data as Site[]) || []);
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
        return <ReceivedCardsTab user={user} />;
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
          <header className="h-14 flex items-center justify-between border-b border-border/30 px-4" role="banner">
            <div className="flex items-center gap-3">
              <SidebarTrigger aria-label="Toggle sidebar" />
              <h1 className="text-lg font-semibold text-foreground font-sans">
                {sectionTitles[activeSection]}
              </h1>
            </div>
            <nav className="flex items-center gap-2" aria-label="Admin actions">
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
