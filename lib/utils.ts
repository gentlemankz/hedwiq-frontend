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
 * Generates a consistent color class for a given identifier.
 * Uses a hash function to ensure the same identifier always gets the same color.
 * @param identifier - A unique string identifier (e.g., user ID, participant identity)
 * @returns A Tailwind background color class
 */
export function getHashedColor(identifier: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-yellow-500",
    "bg-red-500",
  ];
  if (!identifier || typeof identifier !== "string") return colors[0];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
