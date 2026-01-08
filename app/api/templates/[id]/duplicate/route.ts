/**
 * Template Duplicate API Route
 *
 * POST /api/templates/[id]/duplicate - Duplicate a template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { duplicateTemplate } from "@/lib/db/template";
import { validateTemplateId } from "@/lib/validation/template";
import type { CreateTemplateResponse, TemplateCategory } from "@/types/template";
import { TEMPLATE_CATEGORIES, TEMPLATE_LIMITS } from "@/types/template";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface AgendaItemInput {
  title: string;
  description?: string;
  estimatedDuration: number;
  isRequired?: boolean;
  presenterRole?: string | null;
}

interface PlanningQuestionInput {
  question: string;
  category: string;
  isRequired?: boolean;
  placeholder?: string;
}

interface DuplicateTemplateBody {
  name?: string;
  description?: string;
  category?: string;
  teamId?: string | null;
  // Customization options
  defaultDuration?: number;
  suggestedCadence?: string;
  defaultGoal?: string;
  agendaItems?: AgendaItemInput[];
  planningQuestions?: PlanningQuestionInput[];
}

const validCategories = Object.keys(TEMPLATE_CATEGORIES);

/**
 * POST /api/templates/[id]/duplicate
 *
 * Duplicate a template to create a copy.
 * Any user can duplicate system templates.
 * Personal templates can only be duplicated by their creator.
 * Team templates can only be duplicated by team members.
 *
 * Body:
 * - name: string (optional) - Custom name for the duplicated template
 * - description: string (optional) - Custom description for the duplicated template
 * - category: string (optional) - Category for the duplicated template
 * - teamId: string | null (optional) - Team ID to create as team template, null for personal
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

  // Parse optional request body
  let body: DuplicateTemplateBody = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate name if provided
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Name must be a string" },
        { status: 400 }
      );
    }
    if (body.name.length < 3) {
      return NextResponse.json(
        { error: "Name must be at least 3 characters" },
        { status: 400 }
      );
    }
    if (body.name.length > TEMPLATE_LIMITS.MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be at most ${TEMPLATE_LIMITS.MAX_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  // Validate description if provided
  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return NextResponse.json(
        { error: "Description must be a string" },
        { status: 400 }
      );
    }
    if (body.description.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `Description must be at most ${TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  // Validate category if provided
  if (body.category !== undefined) {
    if (!validCategories.includes(body.category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Validate teamId if provided
  if (body.teamId !== undefined && body.teamId !== null) {
    if (typeof body.teamId !== "string") {
      return NextResponse.json(
        { error: "Team ID must be a string or null" },
        { status: 400 }
      );
    }
  }

  try {
    const template = await duplicateTemplate(id, session.user.id, {
      name: body.name,
      description: body.description,
      category: body.category as TemplateCategory | undefined,
      teamId: body.teamId,
      // Customization options
      defaultDuration: body.defaultDuration,
      suggestedCadence: body.suggestedCadence,
      defaultGoal: body.defaultGoal,
      agendaItems: body.agendaItems,
      planningQuestions: body.planningQuestions,
    });

    const response: CreateTemplateResponse = { template };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Duplicate template error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("not found or not accessible")) {
        return NextResponse.json(
          { error: "Template not found or not accessible" },
          { status: 404 }
        );
      }
      if (error.message.includes("Only team admins")) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to duplicate template" },
      { status: 500 }
    );
  }
}
