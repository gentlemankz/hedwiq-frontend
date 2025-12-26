import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  sendEmail,
  generateVerificationEmailHtml,
  generatePasswordResetEmailHtml,
} from "@/lib/email/smtp";
import { POLAR_CHECKOUT_PRODUCTS } from "@/lib/polar";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ============================================================================
// Polar Configuration
// ============================================================================

// Validate required environment variables at startup
const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const POLAR_ENVIRONMENT = process.env.POLAR_ENVIRONMENT || "sandbox";

// Log warning if Polar is not fully configured (but don't throw to allow graceful degradation)
if (!POLAR_ACCESS_TOKEN) {
  console.warn("[Polar] POLAR_ACCESS_TOKEN is not set. Payment features will be disabled.");
}
if (!POLAR_WEBHOOK_SECRET) {
  console.warn("[Polar] POLAR_WEBHOOK_SECRET is not set. Webhook validation will fail.");
}

// Polar SDK client configuration (may be undefined if not configured)
const polarClient = POLAR_ACCESS_TOKEN
  ? new Polar({
      accessToken: POLAR_ACCESS_TOKEN,
      server: POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
    })
  : null;

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
  plugins: [
    nextCookies(),
    // Polar payment integration (only enabled if configured)
    ...(polarClient
      ? [
          polar({
            client: polarClient,
            // Automatically create a Polar customer when a user signs up
            createCustomerOnSignUp: true,
            use: [
              // Checkout plugin - enables seamless checkout integration
              checkout({
                products: POLAR_CHECKOUT_PRODUCTS,
                // Redirect URL after successful checkout
                successUrl: "/dashboard?checkout=success",
                // Only allow authenticated users to checkout
                authenticatedUsersOnly: true,
              }),
              // Portal plugin - enables customer management of purchases/subscriptions
              portal(),
              // Usage plugin - for usage-based billing and tracking
              usage(),
              // Webhooks plugin - handle Polar webhook events
              ...(POLAR_WEBHOOK_SECRET
                ? [
                    webhooks({
                      secret: POLAR_WEBHOOK_SECRET,
                      // Triggered when a subscription becomes active
                      onSubscriptionActive: async (payload) => {
                        // Only log in development to avoid leaking sensitive data in production
                        if (POLAR_ENVIRONMENT !== "production") {
                          console.log("[Polar Webhook] Subscription activated:", {
                            subscriptionId: payload.data.id,
                            productId: payload.data.productId,
                          });
                        }
                        // TODO: Update local subscription cache when implemented
                      },
                      // Triggered when a subscription is canceled
                      onSubscriptionCanceled: async (payload) => {
                        if (POLAR_ENVIRONMENT !== "production") {
                          console.log("[Polar Webhook] Subscription canceled:", {
                            subscriptionId: payload.data.id,
                          });
                        }
                        // TODO: Handle subscription cancellation
                      },
                      // Triggered when a subscription is revoked (immediate cancellation)
                      onSubscriptionRevoked: async (payload) => {
                        if (POLAR_ENVIRONMENT !== "production") {
                          console.log("[Polar Webhook] Subscription revoked:", {
                            subscriptionId: payload.data.id,
                          });
                        }
                        // TODO: Handle immediate subscription revocation
                      },
                      // Triggered when an order is paid
                      onOrderPaid: async (payload) => {
                        if (POLAR_ENVIRONMENT !== "production") {
                          console.log("[Polar Webhook] Order paid:", {
                            orderId: payload.data.id,
                          });
                        }
                      },
                      // Catch-all for any webhook event (useful for debugging in development)
                      onPayload: async (payload) => {
                        if (POLAR_ENVIRONMENT !== "production") {
                          console.log("[Polar Webhook] Event received:", payload.type);
                        }
                      },
                    }),
                  ]
                : []),
            ],
          }),
        ]
      : []),
  ],
});

export type Session = typeof auth.$Infer.Session;

// Export Polar client for use in other parts of the application
export { polarClient };
