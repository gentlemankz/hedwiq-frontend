/**
 * Subscription Checkout API
 *
 * POST /api/subscription/checkout
 * Creates a Polar checkout session and returns the checkout URL.
 *
 * Authentication: User session required
 *
 * Request Body:
 * - productSlug: string - The product slug (e.g., "pro", "pro-annual", "business", "business-annual")
 * - successUrl?: string - Optional custom success redirect URL
 *
 * Response:
 * - checkoutUrl: string - The Polar checkout URL to redirect the user to
 * - productSlug: string - The requested product slug
 * - productId: string - The Polar product ID
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, polarClient } from "@/lib/auth";
import { handleAPIError, unauthorized, validationError } from "@/lib/api";
import {
  getProductBySlug,
  isValidProductSlug,
  POLAR_PRODUCTS,
} from "@/lib/polar/constants";
import { getOrCreatePolarCustomer } from "@/lib/polar/usage";

// ============================================================================
// Types
// ============================================================================

interface CheckoutRequestBody {
  productSlug: string;
  successUrl?: string;
}

interface CheckoutResponse {
  checkoutUrl: string;
  productSlug: string;
  productId: string;
}

// ============================================================================
// Security: URL Validation
// ============================================================================

/**
 * Validates that a URL is safe to redirect to (prevents open redirect attacks).
 * Only allows:
 * - Relative URLs starting with /
 * - Absolute URLs matching NEXT_PUBLIC_APP_URL
 *
 * @returns The validated URL or null if invalid
 */
function validateSuccessUrl(url: string | undefined, appUrl: string): string | null {
  if (!url) return null;

  // Trim and basic sanitization
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  // Allow relative URLs starting with / (but not // which could be protocol-relative)
  if (trimmedUrl.startsWith("/") && !trimmedUrl.startsWith("//")) {
    // Prevent path traversal and ensure it's a clean path
    // Only allow alphanumeric, -, _, /, ?, =, &, . characters
    if (/^\/[a-zA-Z0-9\-_/?.=&]*$/.test(trimmedUrl)) {
      return trimmedUrl;
    }
    return null;
  }

  // For absolute URLs, validate against allowed origin
  try {
    const parsedUrl = new URL(trimmedUrl);
    const allowedOrigin = new URL(appUrl);

    // Must match the app's protocol and host exactly
    if (
      parsedUrl.protocol === allowedOrigin.protocol &&
      parsedUrl.host === allowedOrigin.host
    ) {
      return trimmedUrl;
    }
  } catch {
    // URL parsing failed - invalid URL
    return null;
  }

  return null;
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw unauthorized("Authentication required");
    }

    // Check if Polar is configured
    if (!polarClient) {
      throw validationError("Payment system is not configured");
    }

    // Parse request body
    let body: CheckoutRequestBody;
    try {
      body = await request.json();
    } catch {
      throw validationError("Invalid JSON body");
    }

    // Validate product slug
    const { productSlug, successUrl } = body;

    if (!productSlug || typeof productSlug !== "string") {
      throw validationError("productSlug is required", {
        validSlugs: POLAR_PRODUCTS.map((p) => p.slug),
      });
    }

    if (!isValidProductSlug(productSlug)) {
      throw validationError(`Invalid product slug: "${productSlug}"`, {
        validSlugs: POLAR_PRODUCTS.map((p) => p.slug),
      });
    }

    const product = getProductBySlug(productSlug);
    if (!product) {
      throw validationError(`Product not found: "${productSlug}"`);
    }

    // Get or create Polar customer using shared utility
    const userId = session.user.id;
    const userEmail = session.user.email;
    const userName = session.user.name;

    const { customer: polarCustomer, error: customerError } = await getOrCreatePolarCustomer(
      userId,
      userEmail,
      userName
    );

    if (!polarCustomer) {
      throw validationError(customerError || "Failed to get or create customer");
    }

    // Build success URL with security validation
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const defaultSuccessUrl = `${appUrl}/dashboard?checkout=success`;

    // Validate custom successUrl to prevent open redirect attacks
    const validatedSuccessUrl = validateSuccessUrl(successUrl, appUrl);
    if (successUrl && !validatedSuccessUrl) {
      throw validationError(
        "Invalid successUrl: must be a relative path or match the app domain",
        { allowedOrigin: appUrl }
      );
    }

    // Use validated URL or default
    const finalSuccessUrl = validatedSuccessUrl
      ? (validatedSuccessUrl.startsWith("/") ? `${appUrl}${validatedSuccessUrl}` : validatedSuccessUrl)
      : defaultSuccessUrl;

    // Create checkout session
    // Note: Polar SDK expects 'products' as an array of product IDs
    const checkout = await polarClient.checkouts.create({
      products: [product.productId],
      customerId: polarCustomer.id,
      successUrl: finalSuccessUrl,
      metadata: {
        userId,
        productSlug,
        tier: product.tier,
      },
    });

    const response: CheckoutResponse = {
      checkoutUrl: checkout.url,
      productSlug,
      productId: product.productId,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ============================================================================
// GET Handler - List available products
// ============================================================================

export async function GET() {
  try {
    // This endpoint is public - returns available products for checkout
    // No authentication required for viewing products

    const products = POLAR_PRODUCTS.map((product) => ({
      slug: product.slug,
      productId: product.productId,
      tier: product.tier,
      interval: product.interval,
      displayName: product.displayName,
    }));

    return NextResponse.json({
      products,
      isConfigured: !!polarClient,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
