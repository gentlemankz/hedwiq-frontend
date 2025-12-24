import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  sendEmail,
  generateVerificationEmailHtml,
  generatePasswordResetEmailHtml,
} from "@/lib/email/smtp";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const auth = betterAuth({
  appName: "Hedwiq",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disabled - users can sign in immediately
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const { html, text } = generatePasswordResetEmailHtml({
        userName: user.name || undefined,
        resetLink: url,
        appUrl: APP_URL,
      });
      const result = await sendEmail({
        to: user.email,
        subject: "Reset your Hedwiq password",
        html,
        text,
      });
      // Log but don't throw on SMTP not configured - allows graceful degradation
      if (!result.success && result.error !== "SMTP not configured") {
        console.error(`Failed to send password reset email to ${user.email}:`, result.error);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: false, // Disabled - no verification email on signup
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = generateVerificationEmailHtml({
        userName: user.name || undefined,
        verificationLink: url,
        appUrl: APP_URL,
      });
      const result = await sendEmail({
        to: user.email,
        subject: "Verify your Hedwiq email address",
        html,
        text,
      });
      // Log but don't throw on SMTP not configured - allows graceful degradation
      if (!result.success && result.error !== "SMTP not configured") {
        console.error(`Failed to send verification email to ${user.email}:`, result.error);
      }
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
