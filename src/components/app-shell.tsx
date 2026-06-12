import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Ticket,
  Plus,
  Users,
  BarChart3,
  Bell,
  LogOut,
  Menu,
  HeadphonesIcon,
  Activity,
  Trophy,
  GitCompare,
  UserCog,
  Trash2,
  Package,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isTechnician, isClient, primaryRole, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const items: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/admin/executive", label: "Executivo", icon: BarChart3, show: isAdmin },
    { to: "/admin/activity", label: "Centro de Atividades", icon: Activity, show: isAdmin },
    { to: "/tickets", label: "Tickets", icon: Ticket, show: true },
    { to: "/tickets/new", label: "Novo ticket", icon: Plus, show: isClient || isAdmin },
    { to: "/admin/technicians", label: "Técnicos", icon: UserCog, show: isAdmin },
    { to: "/admin/inventory", label: "Inventário", icon: Package, show: isAdmin || isTechnician },
    { to: "/admin/compare", label: "Comparar", icon: GitCompare, show: isAdmin },
    { to: "/admin/ranking", label: "Ranking", icon: Trophy, show: isAdmin },
    { to: "/stats", label: "Estatísticas", icon: BarChart3, show: isAdmin },
    { to: "/admin/users", label: "Utilizadores", icon: Users, show: isAdmin },
    { to: "/admin/trash", label: "Lixo", icon: Trash2, show: isAdmin },
    { to: "/notifications", label: "Notificações", icon: Bell, show: true },
  ];

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const Nav = ({ onNav }: { onNav?: () => void }) => {
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    return (
      <nav className="flex flex-col gap-1 px-3">
        {items.filter((i) => i.show).map((i) => {
          const active = pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to));
          const Icon = i.icon;
          return (
            <Link
              key={i.to}
              to={i.to}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{i.label}</span>
              {i.to === "/notifications" && unread > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  };

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
          <HeadphonesIcon className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold">SupportHub</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <Nav onNav={onNav} />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {(profile?.full_name ?? profile?.email ?? "U").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile?.full_name ?? "Utilizador"}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {primaryRole?.replace("_", " ") ?? "—"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}