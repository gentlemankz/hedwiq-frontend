import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listFoldersByUser } from "@/lib/db/folder";
import { SidebarProvider } from "@/contexts/sidebar-context";
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

  // Fetch initial folders for the sidebar
  const initialFolders = await listFoldersByUser(session.user.id, {
    includeMeetingCounts: true,
  });

  return (
    <SidebarProvider initialFolders={initialFolders}>
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
    </SidebarProvider>
  );
}
