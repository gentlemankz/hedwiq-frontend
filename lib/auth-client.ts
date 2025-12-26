"use client";

import { createAuthClient } from "better-auth/react";
import { polarClient } from "@polar-sh/better-auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    // Polar client plugin - enables checkout, portal, and customer methods
    polarClient()
  ]
});

export const { signIn, signOut, signUp, useSession } = authClient;

// Export email/password auth functions directly from authClient
export const requestPasswordReset = authClient.requestPasswordReset;
export const resetPassword = authClient.resetPassword;
export const sendVerificationEmail = authClient.sendVerificationEmail;

// ============================================================================
// Polar Client Methods (exported for convenience)
// ============================================================================
//
// Available methods through authClient:
//
// Checkout - Redirect user to Polar checkout
// await authClient.checkout({ slug: "pro" }) // or { products: ["product-id"] }
//
// Customer Portal - Redirect user to manage subscriptions
// await authClient.customer.portal()
//
// Customer State - Get full customer state (subscriptions, benefits, meters)
// const { data: customerState } = await authClient.customer.state()
//
// Benefits - List granted benefits
// const { data: benefits } = await authClient.customer.benefits.list({ query: { page: 1, limit: 10 } })
//
// Orders - List orders (purchases, renewals)
// const { data: orders } = await authClient.customer.orders.list({ query: { page: 1, limit: 10 } })
//
// Subscriptions - List subscriptions
// const { data: subscriptions } = await authClient.customer.subscriptions.list({ query: { page: 1, limit: 10, active: true } })
//
// Usage Ingestion - Track usage events
// await authClient.usage.ingest({ event: "meeting-minutes", metadata: { duration: 30 } })
//
// Customer Meters - List usage meters
// const { data: meters } = await authClient.usage.meters.list({ query: { page: 1, limit: 10 } })
// ============================================================================
