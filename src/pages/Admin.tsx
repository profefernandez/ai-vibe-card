import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient as db } from "@/lib/apiClient";
import type { User } from "@/lib/apiClient";
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
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection>("import");
  const navigate = useNavigate();

  useEffect(() => {
    // DEV BYPASS: skip auth entirely when API is not running
    if (!import.meta.env.PROD) {
      setUser({ id: "dev-user", email: "dev@localhost" });
      setLoading(false);
      return;
    }

    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    db.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
    await db.auth.signOut();
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
        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onBack={() => navigate("/")}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/30 px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold text-foreground font-sans">
                {sectionTitles[activeSection]}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ExternalLink className="w-4 h-4 mr-1" /> View Card
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-1" /> Sign Out
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
