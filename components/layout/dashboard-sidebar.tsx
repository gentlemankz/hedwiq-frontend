"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  FolderClosed,
  FolderOpen,
  Link2,
  Settings,
  ChevronRight,
  Plus,
  LogOut,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { FolderColorDot, EditFolderDialog, DeleteFolderDialog } from "@/components/folders";
import { TeamSidebarSection } from "@/components/teams";
import { AgentSidebarSection } from "@/components/agents";
import { SubscriptionWidget } from "@/components/subscription";
import { getInitials } from "@/lib/utils";
import type { User } from "@/types/user";
import type { Folder } from "@/types/folder";

// ============================================================================
// Types
// ============================================================================

interface DashboardSidebarProps {
  user: User;
}

// ============================================================================
// Navigation Items
// ============================================================================

const bottomNavItems = [
  {
    title: "Templates",
    href: "/dashboard/templates",
    icon: FileText,
  },
  {
    title: "Integrations",
    href: "/dashboard/integrations",
    icon: Link2,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

// ============================================================================
// Component
// ============================================================================

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const {
    folders,
    foldersLoading,
    expandedSections,
    toggleSection,
    updateFolder,
    deleteFolder,
  } = useSidebarContext();

  // Folder dialog state
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  const isPastMeetingsExpanded = expandedSections.has("past-meetings");

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/sign-in";
        },
      },
    });
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header with User Info */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={user.image || undefined} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="start"
                sideOffset={4}
              >
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={user.image || undefined} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Subscription Widget */}
      <div className="px-2 py-2">
        <SubscriptionWidget />
      </div>

      <SidebarSeparator />

      {/* Main Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Home - direct render (no array map for single item) */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip="Home"
                >
                  <Link href="/dashboard">
                    <Home />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Teams Section */}
              <TeamSidebarSection userId={user.id} />

              {/* Agents Section */}
              <AgentSidebarSection />

              {/* Past Meetings with Folders */}
              <SidebarMenuItem>
                <Collapsible
                  open={isPastMeetingsExpanded}
                  onOpenChange={() => toggleSection("past-meetings")}
                  className="group/collapsible"
                >
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/dashboard/past-meetings")}
                      tooltip="Past Meetings"
                    >
                      {isPastMeetingsExpanded ? <FolderOpen /> : <FolderClosed />}
                      <span>Past Meetings</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {/* All Meetings */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/dashboard/past-meetings"}
                        >
                          <Link href="/dashboard/past-meetings">
                            <span>All Meetings</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      {/* Folders */}
                      {foldersLoading ? (
                        <SidebarMenuSubItem>
                          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            <span>Loading folders...</span>
                          </div>
                        </SidebarMenuSubItem>
                      ) : (
                        <>
                          {folders.map((folder) => (
                            <SidebarMenuSubItem key={folder.id} className="group/folder">
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  `/dashboard/past-meetings/${folder.id}`
                                }
                              >
                                <Link
                                  href={`/dashboard/past-meetings/${folder.id}`}
                                  className="pr-6"
                                >
                                  <FolderColorDot color={folder.color} size="xs" />
                                  <span className="flex-1 truncate">
                                    {folder.name}
                                  </span>
                                  {folder.meetingCount !== undefined && (
                                    <span className="text-xs text-muted-foreground">
                                      {folder.meetingCount}
                                    </span>
                                  )}
                                </Link>
                              </SidebarMenuSubButton>
                              {/* Folder Actions Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-sidebar-accent transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="size-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" side="right">
                                  <DropdownMenuItem
                                    onClick={() => setEditingFolder(folder)}
                                    disabled={folder.isDefault}
                                  >
                                    <Pencil className="mr-2 size-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setDeletingFolder(folder)}
                                    disabled={folder.isDefault}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 size-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </SidebarMenuSubItem>
                          ))}

                          {/* New Folder Button */}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <Link href="/dashboard/past-meetings?newFolder=true">
                                <Plus className="size-3" />
                                <span>New Folder</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Navigation */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Edit Folder Dialog */}
      {editingFolder && (
        <EditFolderDialog
          open={!!editingFolder}
          onOpenChange={(open) => !open && setEditingFolder(null)}
          folder={editingFolder}
          updateFolder={updateFolder}
          onFolderUpdated={() => {
            // Context's updateFolder already updates local state
            // No need to call refreshFolders() - avoids redundant API call
            setEditingFolder(null);
          }}
        />
      )}

      {/* Delete Folder Dialog */}
      {deletingFolder && (
        <DeleteFolderDialog
          open={!!deletingFolder}
          onOpenChange={(open) => !open && setDeletingFolder(null)}
          folder={deletingFolder}
          deleteFolder={deleteFolder}
          onFolderDeleted={() => {
            // Context's deleteFolder already updates local state
            // No need to call refreshFolders() - avoids redundant API call
            setDeletingFolder(null);
          }}
        />
      )}
    </Sidebar>
  );
}
