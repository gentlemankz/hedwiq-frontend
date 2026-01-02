/**
 * Polar Usage Tracking Service
 *
 * Handles usage-based billing with Polar:
 * - Meeting minutes tracking
 * - Email draft tracking
 * - Storage usage tracking
 * - Pre-meeting limit checks
 *
 * NOTE: This file has been modularized. All implementation code is now in
 * the `usage/` directory. This file re-exports everything for backward compatibility.
 *
 * @see ./usage/index.ts for the modular structure
 */

export * from "./usage/index";
