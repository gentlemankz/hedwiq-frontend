/**
 * SMTP Email Service
 *
 * Handles sending transactional emails via SMTP (Gmail or other providers).
 * Used for authentication emails (verification, password reset).
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// ============================================================================
// Configuration
// ============================================================================

// WeakRef-like pattern for transporter cleanup in serverless environments
let _transporter: Transporter | null = null;
let _transporterCreatedAt: number = 0;
const TRANSPORTER_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create the SMTP transporter.
 * Supports Gmail SMTP or custom SMTP servers.
 * Includes connection pooling and automatic cleanup for serverless environments.
 */
function getTransporter(): Transporter | null {
  const now = Date.now();

  // Cleanup stale transporter to prevent memory leaks in long-running processes
  if (_transporter && now - _transporterCreatedAt > TRANSPORTER_TTL_MS) {
    _transporter.close();
    _transporter = null;
  }

  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Check if SMTP is configured
  if (!host || !user || !pass) {
    console.warn("SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.");
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
    pool: true, // Use connection pooling
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,
    socketTimeout: 30000,
  });

  _transporterCreatedAt = now;

  return _transporter;
}

// ============================================================================
// Types
// ============================================================================

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// Email Sending
// ============================================================================

const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@luframe.com";
const FROM_NAME = process.env.SMTP_FROM_NAME || "Luframe";

/**
 * Send an email via SMTP.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const transport = getTransporter();

  if (!transport) {
    console.warn("SMTP not configured, logging email to console:");
    console.log(`\n📧 Email to: ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    console.log(`   Content: ${options.text || "See HTML"}\n`);
    return {
      success: false,
      error: "SMTP not configured",
    };
  }

  try {
    const result = await transport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("Failed to send email via SMTP:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Auth Email Templates (Plain HTML for SMTP)
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escape and encode a URL for safe HTML attribute use.
 */
function escapeUrl(url: string): string {
  try {
    // Validate URL structure
    new URL(url);
    return escapeHtml(url);
  } catch {
    // If invalid URL, return escaped version
    return escapeHtml(url);
  }
}

/**
 * Generate email verification HTML.
 */
export function generateVerificationEmailHtml(options: {
  userName?: string;
  verificationLink: string;
  appUrl: string;
}): { html: string; text: string } {
  const safeUserName = options.userName ? escapeHtml(options.userName) : null;
  const safeVerificationLink = escapeUrl(options.verificationLink);
  const greeting = safeUserName ? `Hi ${safeUserName}` : "Hi there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 40px;">
    <h1 style="color: #1f2937; font-size: 24px; font-weight: 600; margin: 0 0 24px;">Verify your email address</h1>

    <p style="color: #374151; font-size: 14px; line-height: 24px; margin: 0 0 12px;">${greeting},</p>

    <p style="color: #374151; font-size: 14px; line-height: 24px; margin: 0 0 24px;">
      Thanks for signing up for Luframe! Please verify your email address by clicking the button below.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${safeVerificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        Verify Email Address
      </a>
    </div>

    <p style="color: #6b7280; font-size: 13px; line-height: 20px; margin: 24px 0 0;">
      This link will expire in 1 hour. If the button doesn't work, copy and paste this link into your browser:
    </p>

    <p style="color: #374151; font-size: 12px; line-height: 20px; word-break: break-all; background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 12px 0;">
      ${safeVerificationLink}
    </p>

    <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 32px 0;">

    <p style="color: #6b7280; font-size: 12px; line-height: 20px; margin: 0;">
      If you didn't create an account on Luframe, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
`;

  const text = `${greeting},

Thanks for signing up for Luframe! Please verify your email address by clicking the link below:

${options.verificationLink}

This link will expire in 1 hour.

If you didn't create an account on Luframe, you can safely ignore this email.`;

  return { html, text };
}

/**
 * Generate password reset HTML.
 */
export function generatePasswordResetEmailHtml(options: {
  userName?: string;
  resetLink: string;
  appUrl: string;
}): { html: string; text: string } {
  const safeUserName = options.userName ? escapeHtml(options.userName) : null;
  const safeResetLink = escapeUrl(options.resetLink);
  const greeting = safeUserName ? `Hi ${safeUserName}` : "Hi there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 40px;">
    <h1 style="color: #1f2937; font-size: 24px; font-weight: 600; margin: 0 0 24px;">Reset your password</h1>

    <p style="color: #374151; font-size: 14px; line-height: 24px; margin: 0 0 12px;">${greeting},</p>

    <p style="color: #374151; font-size: 14px; line-height: 24px; margin: 0 0 24px;">
      We received a request to reset your password for your Luframe account. Click the button below to choose a new password.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${safeResetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        Reset Password
      </a>
    </div>

    <p style="color: #6b7280; font-size: 13px; line-height: 20px; margin: 24px 0 0;">
      This link will expire in 1 hour. If the button doesn't work, copy and paste this link into your browser:
    </p>

    <p style="color: #374151; font-size: 12px; line-height: 20px; word-break: break-all; background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 12px 0;">
      ${safeResetLink}
    </p>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 24px 0;">
      <p style="color: #92400e; font-size: 13px; line-height: 20px; margin: 0;">
        <strong>Security tip:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 32px 0;">

    <p style="color: #6b7280; font-size: 12px; line-height: 20px; margin: 0;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
`;

  const text = `${greeting},

We received a request to reset your password for your Luframe account. Click the link below to choose a new password:

${options.resetLink}

This link will expire in 1 hour.

Security tip: If you didn't request this password reset, please ignore this email. Your password will remain unchanged.`;

  return { html, text };
}
