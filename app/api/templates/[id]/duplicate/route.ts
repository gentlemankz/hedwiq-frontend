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
import type { CreateTemplateResponse } from "@/types/template";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface DuplicateTemplateBody {
  name?: string;
}

/**
 * POST /api/templates/[id]/duplicate
 *
 * Duplicate a template to create a personal copy.
 * Any user can duplicate system templates.
 * Personal templates can only be duplicated by their creator.
 * Team templates can only be duplicated by team members.
 *
 * Body:
 * - name: string (optional) - Custom name for the duplicated template
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
    if (body.name.length > 100) {
      return NextResponse.json(
        { error: "Name must be at most 100 characters" },
        { status: 400 }
      );
    }
  }

  try {
    const template = await duplicateTemplate(id, session.user.id, body.name);

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
    }

    return NextResponse.json(
      { error: "Failed to duplicate template" },
      { status: 500 }
    );
  }
}
