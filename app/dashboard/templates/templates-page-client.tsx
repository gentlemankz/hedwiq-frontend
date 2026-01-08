"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Users, Building2, Copy } from "lucide-react";
import {
  TemplateEditor,
  useTemplateEditor,
  TemplateBrowserDialog,
  useTemplateBrowser,
} from "@/components/templates";
import type { TemplateWithItems, CreateTemplateRequest, UpdateTemplateRequest } from "@/types/template";
import { useTemplates } from "@/hooks/use-templates";

interface TemplatesPageClientProps {
  userId: string;
  teams: { id: string; name: string }[];
}

type PageView = "browse" | "create" | "edit" | "customize";

export function TemplatesPageClient({ userId: _userId, teams }: TemplatesPageClientProps) {
  const [view, setView] = useState<PageView>("browse");
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithItems | null>(null);
  const [activeTab, setActiveTab] = useState<"personal" | "team" | "system">("personal");
  const [customizeLoading, setCustomizeLoading] = useState(false);
  const [customizeError, setCustomizeError] = useState<string>();

  // Fetch templates for inline browsing
  const {
    templates,
    isLoading: templatesLoading,
    refetch: refetchTemplates,
  } = useTemplates({
    scope: activeTab,
    enabled: view === "browse",
  });

  // Template browser dialog hook (for advanced browsing)
  const browserDialog = useTemplateBrowser();

  // Template editor hook (for create/edit)
  const templateEditor = useTemplateEditor({
    template: view === "edit" ? editingTemplate || undefined : undefined,
    onSuccess: () => {
      refetchTemplates();
      setView("browse");
      setEditingTemplate(null);
    },
  });

  // Handle customization submit (duplicate API)
  const handleCustomizeSubmit = useCallback(
    async (data: CreateTemplateRequest | UpdateTemplateRequest) => {
      if (!editingTemplate) return;

      setCustomizeLoading(true);
      setCustomizeError(undefined);

      try {
        const response = await fetch(`/api/templates/${editingTemplate.id}/duplicate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            description: data.description,
            category: data.category,
            // Additional customizations are passed through the data
            defaultDuration: data.defaultDuration,
            suggestedCadence: data.suggestedCadence,
            defaultGoal: data.defaultGoal,
            agendaItems: data.agendaItems,
            planningQuestions: data.planningQuestions,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Failed to save template" }));
          throw new Error(error.error || "Failed to save template");
        }

        refetchTemplates();
        setView("browse");
        setEditingTemplate(null);
        setActiveTab("personal"); // Switch to personal templates to see the new copy
      } catch (err) {
        setCustomizeError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setCustomizeLoading(false);
      }
    },
    [editingTemplate, refetchTemplates]
  );

  // Handle template selection from browser dialog
  const handleSelectFromBrowser = useCallback((template: TemplateWithItems | null) => {
    if (template) {
      setEditingTemplate(template);
      // System templates go to customize mode, others go to edit
      setView(template.scope === "system" ? "customize" : "edit");
      browserDialog.setIsOpen(false);
    }
  }, [browserDialog]);

  // Handle edit from inline list (for non-system templates)
  const handleEditTemplate = useCallback((template: TemplateWithItems) => {
    setEditingTemplate(template);
    setView("edit");
  }, []);

  // Handle customize from inline list (for system templates)
  const handleCustomizeTemplate = useCallback((template: TemplateWithItems) => {
    setEditingTemplate(template);
    setCustomizeError(undefined);
    setView("customize");
  }, []);

  // Handle view details (read-only view)
  const handleViewTemplate = useCallback((template: TemplateWithItems) => {
    setEditingTemplate(template);
    setView("edit"); // Uses readOnly prop
  }, []);

  // Handle create new
  const handleCreateNew = useCallback(() => {
    setEditingTemplate(null);
    setView("create");
  }, []);

  // Handle back to browse
  const handleBack = useCallback(() => {
    setView("browse");
    setEditingTemplate(null);
  }, []);

  // Handle delete success
  const handleDeleteSuccess = useCallback(() => {
    refetchTemplates();
  }, [refetchTemplates]);

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {view === "browse" ? (
          <>
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
                <p className="text-muted-foreground">
                  Create and manage reusable meeting templates
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => browserDialog.setIsOpen(true)}>
                  <FileText className="mr-2 size-4" />
                  Browse All
                </Button>
                <Button onClick={handleCreateNew}>
                  <Plus className="mr-2 size-4" />
                  Create Template
                </Button>
              </div>
            </div>

            {/* Template Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="personal" className="gap-2">
                  <FileText className="size-4" />
                  My Templates
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-2">
                  <Users className="size-4" />
                  Team Templates
                </TabsTrigger>
                <TabsTrigger value="system" className="gap-2">
                  <Building2 className="size-4" />
                  System Templates
                </TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="mt-6">
                <TemplateGrid
                  templates={templates}
                  loading={templatesLoading}
                  onEdit={handleEditTemplate}
                  onDelete={handleDeleteSuccess}
                  emptyMessage="You haven't created any personal templates yet."
                  emptyAction={
                    <Button onClick={handleCreateNew}>
                      <Plus className="mr-2 size-4" />
                      Create Your First Template
                    </Button>
                  }
                />
              </TabsContent>

              <TabsContent value="team" className="mt-6">
                <TemplateGrid
                  templates={templates}
                  loading={templatesLoading}
                  onEdit={handleEditTemplate}
                  onDelete={handleDeleteSuccess}
                  emptyMessage="No team templates available. Create one to share with your team."
                  emptyAction={
                    teams.length > 0 ? (
                      <Button onClick={handleCreateNew}>
                        <Plus className="mr-2 size-4" />
                        Create Team Template
                      </Button>
                    ) : undefined
                  }
                />
              </TabsContent>

              <TabsContent value="system" className="mt-6">
                <TemplateGrid
                  templates={templates}
                  loading={templatesLoading}
                  onEdit={handleEditTemplate}
                  onCustomize={handleCustomizeTemplate}
                  onView={handleViewTemplate}
                  onDelete={handleDeleteSuccess}
                  emptyMessage="No system templates available."
                  readOnly
                />
              </TabsContent>
            </Tabs>

            {/* Browser Dialog */}
            <TemplateBrowserDialog
              open={browserDialog.isOpen}
              onOpenChange={browserDialog.setIsOpen}
              onSelect={handleSelectFromBrowser}
              onDelete={() => handleDeleteSuccess()}
            />
          </>
        ) : view === "customize" ? (
          /* Customize System Template View */
          <TemplateEditor
            template={editingTemplate || undefined}
            teams={teams}
            onSubmit={handleCustomizeSubmit}
            onBack={handleBack}
            isLoading={customizeLoading}
            serverError={customizeError}
            readOnly={true}
            isCustomizing={true}
          />
        ) : (
          /* Create/Edit View */
          <TemplateEditor
            template={editingTemplate || undefined}
            teams={teams}
            onSubmit={templateEditor.handleSubmit}
            onBack={handleBack}
            isLoading={templateEditor.isLoading}
            serverError={templateEditor.serverError}
            readOnly={editingTemplate?.scope === "system"}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Template Grid Component
// ============================================================================

interface TemplateGridProps {
  templates: TemplateWithItems[];
  loading: boolean;
  onEdit: (template: TemplateWithItems) => void;
  onCustomize?: (template: TemplateWithItems) => void;
  onView?: (template: TemplateWithItems) => void;
  onDelete: () => void;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
  readOnly?: boolean;
}

function TemplateGrid({
  templates,
  loading,
  onEdit,
  onCustomize,
  onView,
  onDelete,
  emptyMessage,
  emptyAction,
  readOnly,
}: TemplateGridProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (templateId: string) => {
    setDeletingId(templateId);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        onDelete();
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-5 w-2/3 bg-muted rounded" />
              <div className="h-4 w-full bg-muted rounded mt-2" />
            </CardHeader>
            <CardContent>
              <div className="h-4 w-1/2 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="size-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">{emptyMessage}</p>
          {emptyAction}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <Card key={template.id} className="group hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{template.name}</CardTitle>
                {template.description && (
                  <CardDescription className="line-clamp-2 mt-1">
                    {template.description}
                  </CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{template.defaultDuration} min</span>
              <span>{template.agendaItems.length} agenda items</span>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onEdit(template)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(template.id)}
                  disabled={deletingId === template.id}
                >
                  {deletingId === template.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            )}
            {readOnly && (
              <div className="flex items-center gap-2 mt-4">
                {onView && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onView(template)}
                  >
                    View Details
                  </Button>
                )}
                {onCustomize && (
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => onCustomize(template)}
                  >
                    <Copy className="size-3" />
                    Customize
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
