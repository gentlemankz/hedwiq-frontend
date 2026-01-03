import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listFoldersByUser } from "@/lib/db/folder";
import { getTeamHierarchyForUser, listTeamsForUser } from "@/lib/db/team";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { TeamProvider } from "@/contexts/team-context";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import {
  SidebarProvider as SidebarUIProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/layout";
import { Separator } from "@/components/ui/separator";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Fetch initial folders and teams for the sidebar
  // Use Promise.allSettled to handle partial failures gracefully
  const [foldersResult, teamsResult, hierarchyResult] = await Promise.allSettled([
    listFoldersByUser(session.user.id, { includeMeetingCounts: true }),
    listTeamsForUser(session.user.id),
    getTeamHierarchyForUser(session.user.id),
  ]);

  // Extract results with fallbacks for failed fetches
  const initialFolders = foldersResult.status === "fulfilled" ? foldersResult.value : [];
  const initialTeams = teamsResult.status === "fulfilled" ? teamsResult.value : [];
  const initialHierarchy = hierarchyResult.status === "fulfilled" ? hierarchyResult.value : [];

  // Log any failures for debugging
  if (foldersResult.status === "rejected") {
    console.error("[Dashboard] Failed to fetch folders:", foldersResult.reason);
  }
  if (teamsResult.status === "rejected") {
    console.error("[Dashboard] Failed to fetch teams:", teamsResult.reason);
  }
  if (hierarchyResult.status === "rejected") {
    console.error("[Dashboard] Failed to fetch team hierarchy:", hierarchyResult.reason);
  }

  return (
    <SubscriptionProvider>
      <SidebarProvider initialFolders={initialFolders}>
        <TeamProvider initialTeams={initialTeams} initialHierarchy={initialHierarchy}>
          <SidebarUIProvider>
            <DashboardSidebar user={session.user} />
            <SidebarInset>
              {/* Header with sidebar trigger for mobile */}
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <span className="font-semibold">Dashboard</span>
              </header>

              {/* Main Content */}
              <main className="flex-1 overflow-auto">{children}</main>
            </SidebarInset>
          </SidebarUIProvider>
        </TeamProvider>
      </SidebarProvider>
    </SubscriptionProvider>
  );
}
