/**
 * Single Template API Routes
 *
 * GET /api/templates/[id] - Get a template by ID
 * PUT /api/templates/[id] - Update a template
 * DELETE /api/templates/[id] - Delete a template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  canEditTemplate,
} from "@/lib/db/template";
import {
  validateTemplateId,
  validateUpdateTemplateRequest,
} from "@/lib/validation/template";
import type {
  UpdateTemplateRequest,
  GetTemplateResponse,
  UpdateTemplateResponse,
  DeleteTemplateResponse,
} from "@/types/template";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/templates/[id]
 *
 * Get a single template by ID with all related data.
 * Returns template with agenda items, planning questions, team, and creator info.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Validate template ID format
  const idValidation = validateTemplateId(id);
  if (!idValidation.isValid) {
    return NextResponse.json({ error: idValidation.error }, { status: 400 });
  }

  try {
    const template = await getTemplateById(id, session.user.id);

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const response: GetTemplateResponse = { template };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get template error:", error);
    return NextResponse.json(
      { error: "Failed to get template" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/templates/[id]
 *
 * Update an existing template.
 * Cannot update system templates.
 * Requires creator access (for personal) or admin role (for team templates).
 *
 * Body:
 * - name: string (optional)
 * - description: string (optional)
 * - category: TemplateCategory (optional)
 * - defaultDuration: number (optional)
 * - suggestedCadence: string (optional)
 * - defaultGoal: string (optional)
 * - defaultSettings: MeetingSettings (optional)
 * - agendaItems: TemplateAgendaItemInput[] (optional, replaces all if provided)
 * - planningQuestions: PlanningQuestionInput[] (optional, replaces all if provided)
 * - isArchived: boolean (optional)
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Validate template ID format
  const idValidation = validateTemplateId(id);
  if (!idValidation.isValid) {
    return NextResponse.json({ error: idValidation.error }, { status: 400 });
  }

  // Parse request body
  let body: UpdateTemplateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Check if body is empty
  if (Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "No update fields provided" },
      { status: 400 }
    );
  }

  // Validate request
  const validation = validateUpdateTemplateRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Check user has permission to edit the template
    const canEdit = await canEditTemplate(id, session.user.id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "Not authorized to update this template" },
        { status: 403 }
      );
    }

    const template = await updateTemplate(id, session.user.id, body);

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const response: UpdateTemplateResponse = { template };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Update template error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("Cannot modify system templates")) {
        return NextResponse.json(
          { error: "System templates cannot be modified" },
          { status: 403 }
        );
      }
      if (error.message.includes("Not authorized")) {
        return NextResponse.json(
          { error: "Not authorized to update this template" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[id]
 *
 * Delete a template.
 * Cannot delete system templates.
 * Requires creator access (for personal) or owner role (for team templates).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Validate template ID format
  const idValidation = validateTemplateId(id);
  if (!idValidation.isValid) {
    return NextResponse.json({ error: idValidation.error }, { status: 400 });
  }

  try {
    // Check user has permission to delete the template
    const canEdit = await canEditTemplate(id, session.user.id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "Not authorized to delete this template" },
        { status: 403 }
      );
    }

    const result = await deleteTemplate(id, session.user.id);

    if (!result.success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const response: DeleteTemplateResponse = { success: true };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Delete template error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("Cannot delete system templates")) {
        return NextResponse.json(
          { error: "System templates cannot be deleted" },
          { status: 403 }
        );
      }
      if (error.message.includes("Not authorized")) {
        return NextResponse.json(
          { error: "Not authorized to delete this template" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
