import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns initials from a name (max 2 characters)
 * @param name - The full name to extract initials from
 * @returns Uppercase initials (e.g., "John Doe" -> "JD")
 */
export function getInitials(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .split(" ")
    .filter((n) => n.length > 0)
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generates a deterministic hash number from a string identifier.
 * Uses djb2 algorithm for consistent distribution.
 * @param identifier - A unique string identifier
 * @returns A positive integer hash value
 */
function hashString(identifier: string): number {
  if (!identifier || typeof identifier !== "string") return 0;
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/** Available avatar images with matching color names */
const AVATAR_IMAGES = [
  "/blue_avatar.webp",
  "/green_avatar.webp",
  "/orange_avatar.webp",
  "/purple_avatar.webp",
  "/red_avatar.webp",
] as const;

/** Tailwind background colors matching avatar images for fallback consistency */
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-red-500",
] as const;

/**
 * Generates a consistent avatar image path for a given identifier.
 * Uses a hash function to ensure the same identifier always gets the same avatar.
 * @param identifier - A unique string identifier (e.g., user ID, participant identity)
 * @returns A path to one of the avatar images
 */
export function getHashedAvatar(identifier: string): string {
  const hash = hashString(identifier);
  return AVATAR_IMAGES[hash % AVATAR_IMAGES.length];
}

/**
 * Generates a consistent color class for a given identifier.
 * Colors are synchronized with avatar images for visual consistency.
 * @param identifier - A unique string identifier (e.g., user ID, participant identity)
 * @returns A Tailwind background color class
 */
export function getHashedColor(identifier: string): string {
  const hash = hashString(identifier);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
