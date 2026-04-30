import { Globe, FileText, Brain, CreditCard, Plug, User, Settings, ArrowLeft } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

export type AdminSection =
  | "import"
  | "kb"
  | "ai"
  | "cards"
  | "api"
  | "profile"
  | "settings";

const mainItems = [
  { title: "Site Import", value: "import" as AdminSection, icon: Globe },
  { title: "Knowledge Base", value: "kb" as AdminSection, icon: FileText },
  { title: "AI Training", value: "ai" as AdminSection, icon: Brain },
  { title: "Connections", value: "cards" as AdminSection, icon: CreditCard },
];

const accountItems = [
  { title: "API Connectors", value: "api" as AdminSection, icon: Plug },
  { title: "Profile / Card Info", value: "profile" as AdminSection, icon: User },
  { title: "Settings", value: "settings" as AdminSection, icon: Settings },
];

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  onBack: () => void;
}

export default function AdminSidebar({ activeSection, onSectionChange, onBack }: AdminSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30" aria-label="Admin navigation">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    isActive={activeSection === item.value}
                    onClick={() => onSectionChange(item.value)}
                    tooltip={item.title}
                    aria-current={activeSection === item.value ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    isActive={activeSection === item.value}
                    onClick={() => onSectionChange(item.value)}
                    tooltip={item.title}
                    aria-current={activeSection === item.value ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onBack} tooltip="Back to site" aria-label="Back to site">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {!collapsed && <span>Back to Site</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
