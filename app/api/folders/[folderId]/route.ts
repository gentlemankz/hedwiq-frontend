import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getFolderByIdForUser,
  updateFolder,
  deleteFolder,
  folderNameExists,
} from "@/lib/db/folder";
import { validateUpdateFolderRequest } from "@/lib/validation/folder";

interface RouteContext {
  params: Promise<{
    folderId: string;
  }>;
}

/**
 * GET /api/folders/[folderId]
 *
 * Get a specific folder by ID.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await context.params;

  try {
    const folder = await getFolderByIdForUser(folderId, session.user.id);

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Get folder error:", error);
    return NextResponse.json(
      { error: "Failed to get folder" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/folders/[folderId]
 *
 * Update a folder's name, color, or icon.
 * Body:
 * - name: string (optional)
 * - color: string | null (optional)
 * - icon: string | null (optional)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await context.params;

  // Parse request body
  let body: {
    name?: string;
    color?: string | null;
    icon?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateFolderRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Check folder exists and belongs to user
    const existingFolder = await getFolderByIdForUser(folderId, session.user.id);
    if (!existingFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // SECURITY: Prevent renaming the default folder
    if (existingFolder.isDefault && body.name !== undefined) {
      return NextResponse.json(
        { error: "Cannot rename the default folder" },
        { status: 400 }
      );
    }

    // If updating name, check for duplicate
    if (body.name !== undefined) {
      const nameExists = await folderNameExists(
        session.user.id,
        body.name,
        folderId
      );
      if (nameExists) {
        return NextResponse.json(
          { error: "A folder with this name already exists" },
          { status: 409 }
        );
      }
    }

    const folder = await updateFolder(folderId, session.user.id, {
      name: body.name,
      color: body.color,
      icon: body.icon,
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Update folder error:", error);
    return NextResponse.json(
      { error: "Failed to update folder" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/folders/[folderId]
 *
 * Delete a folder. All meetings in the folder are moved to the default folder.
 * Cannot delete the default folder.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await context.params;

  try {
    // Check folder exists and belongs to user
    const existingFolder = await getFolderByIdForUser(folderId, session.user.id);
    if (!existingFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // Check if it's the default folder
    if (existingFolder.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default folder" },
        { status: 400 }
      );
    }

    const result = await deleteFolder(folderId, session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to delete folder" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meetingsMoved: result.meetingsMoved,
    });
  } catch (error) {
    console.error("Delete folder error:", error);

    // Handle specific error for default folder
    if (error instanceof Error && error.message.includes("default folder")) {
      return NextResponse.json(
        { error: "Cannot delete the default folder" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
