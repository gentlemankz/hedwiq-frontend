import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createFolder,
  listFoldersByUser,
  folderNameExists,
} from "@/lib/db/folder";
import { validateCreateFolderRequest } from "@/lib/validation/folder";
import { FOLDER_LIMITS } from "@/types/folder";

/**
 * GET /api/folders
 *
 * List all folders for the authenticated user.
 * Query params:
 * - includeCounts: "true" to include meeting counts (default: false)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeCounts = searchParams.get("includeCounts") === "true";

  try {
    const folders = await listFoldersByUser(session.user.id, {
      includeMeetingCounts: includeCounts,
    });

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("List folders error:", error);
    return NextResponse.json(
      { error: "Failed to list folders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/folders
 *
 * Create a new folder for the authenticated user.
 * Body:
 * - name: string (required)
 * - color: string (optional, hex color)
 * - icon: string (optional)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    name?: string;
    color?: string;
    icon?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateFolderRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Check folder limit
    const existingFolders = await listFoldersByUser(session.user.id);
    if (existingFolders.length >= FOLDER_LIMITS.MAX_FOLDERS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${FOLDER_LIMITS.MAX_FOLDERS_PER_USER} folders allowed` },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const nameExists = await folderNameExists(
      session.user.id,
      body.name as string
    );
    if (nameExists) {
      return NextResponse.json(
        { error: "A folder with this name already exists" },
        { status: 409 }
      );
    }

    const folder = await createFolder({
      userId: session.user.id,
      name: body.name as string,
      color: body.color,
      icon: body.icon,
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
