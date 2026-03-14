import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, LogOut, Globe, FileText, Plug, Brain, CreditCard } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import SiteImportTab from "@/components/admin/SiteImportTab";
import ContentManagerTab from "@/components/admin/ContentManagerTab";
import ApiConnectorTab from "@/components/admin/ApiConnectorTab";
import AiTrainingTab from "@/components/admin/AiTrainingTab";
import ReceivedCardsTab from "@/components/admin/ReceivedCardsTab";

type Site = {
  id: string;
  domain: string;
  name: string | null;
  scrape_status: string;
  page_count: number;
  share_usage_limit: number;
  created_at: string;
};

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  const fetchSites = async () => {
    const { data } = await supabase
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });
    setSites((data as Site[]) || []);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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

  return (
    <div className="min-h-screen bg-gradient-dark px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
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

        {/* Tabs */}
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="w-full justify-start bg-card/50 border border-border/30 h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="import" className="text-xs gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Site Import
            </TabsTrigger>
            <TabsTrigger value="content" className="text-xs gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Content
            </TabsTrigger>
            <TabsTrigger value="api" className="text-xs gap-1.5">
              <Plug className="w-3.5 h-3.5" /> API Connector
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs gap-1.5">
              <Brain className="w-3.5 h-3.5" /> AI Training
            </TabsTrigger>
            <TabsTrigger value="cards" className="text-xs gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Received Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import">
            <SiteImportTab user={user} sites={sites} fetchSites={fetchSites} />
          </TabsContent>
          <TabsContent value="content">
            <ContentManagerTab sites={sites} />
          </TabsContent>
          <TabsContent value="api">
            <ApiConnectorTab user={user} />
          </TabsContent>
          <TabsContent value="ai">
            <AiTrainingTab user={user} />
          </TabsContent>
          <TabsContent value="cards">
            <ReceivedCardsTab user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
