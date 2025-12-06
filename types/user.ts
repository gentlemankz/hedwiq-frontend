/**
 * Shared User interface used across the application
 * for authenticated user data from Better Auth sessions
 */
export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}
