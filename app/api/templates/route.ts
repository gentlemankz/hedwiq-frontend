/**
 * Meeting Templates API Routes
 *
 * GET /api/templates - List templates
 * POST /api/templates - Create a new template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listTemplates, createTemplate } from "@/lib/db/template";
import { validateCreateTemplateRequest } from "@/lib/validation/template";
import type {
  TemplateCategory,
  TemplateScope,
  CreateTemplateRequest,
  ListTemplatesResponse,
  CreateTemplateResponse,
} from "@/types/template";

/**
 * GET /api/templates
 *
 * List templates with filtering and pagination.
 *
 * Query parameters:
 * - scope: 'system' | 'team' | 'personal' | 'all' (default: 'all')
 * - category: TemplateCategory (optional)
 * - teamId: string (optional, for team templates)
 * - includeArchived: boolean (default: false)
 * - search: string (optional)
 * - sortBy: 'name' | 'usageCount' | 'createdAt' (default: 'usageCount')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const scope = searchParams.get("scope") as TemplateScope | "all" | null;
    const category = searchParams.get("category") as TemplateCategory | null;
    const teamId = searchParams.get("teamId");
    const includeArchived = searchParams.get("includeArchived") === "true";
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") as
      | "name"
      | "usageCount"
      | "createdAt"
      | null;
    const sortOrder = searchParams.get("sortOrder") as "asc" | "desc" | null;
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
      100
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const result = await listTemplates({
      userId: session.user.id,
      scope: scope || "all",
      category: category || undefined,
      teamId: teamId || undefined,
      includeArchived,
      search: search || undefined,
      sortBy: sortBy || "usageCount",
      sortOrder: sortOrder || "desc",
      limit,
      offset,
    });

    const response: ListTemplatesResponse = {
      templates: result.templates,
      total: result.total,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("List templates error:", error);
    return NextResponse.json(
      { error: "Failed to list templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates
 *
 * Create a new template.
 *
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - category: TemplateCategory (required)
 * - scope: 'team' | 'personal' (required, cannot create system templates)
 * - teamId: string (required if scope is 'team')
 * - defaultDuration: number (required, minutes)
 * - suggestedCadence: string (optional)
 * - defaultGoal: string (optional)
 * - defaultSettings: MeetingSettings (optional)
 * - agendaItems: TemplateAgendaItemInput[] (required, at least 1)
 * - planningQuestions: PlanningQuestionInput[] (optional)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: CreateTemplateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateTemplateRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const template = await createTemplate({
      ...body,
      createdBy: session.user.id,
    });

    const response: CreateTemplateResponse = { template };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create template error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("Only team admins and owners")) {
        return NextResponse.json(
          { error: "Only team admins and owners can create team templates" },
          { status: 403 }
        );
      }
      if (error.message.includes("Team not found")) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
    }

    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
