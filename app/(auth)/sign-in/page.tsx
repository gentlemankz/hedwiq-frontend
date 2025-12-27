"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, sendVerificationEmail } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { storePendingCheckout } from "@/lib/polar/checkout";
import {
  handlePostAuthCheckout,
  formatPlanName,
  buildOAuthCallbackURL,
} from "@/lib/polar/auth-flow";
import { GoogleIcon } from "@/components/icons";

function SignInContent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const searchParams = useSearchParams();
  const teamInviteToken = searchParams.get("team_invite");
  const authError = searchParams.get("error");
  const verified = searchParams.get("verified");

  // Plan selection from landing page (e.g., ?plan=pro&billing=annual)
  const plan = searchParams.get("plan");
  const billing = searchParams.get("billing") || "annual"; // Default to annual for better value

  // Check if this is a paid plan signup (not free)
  const isPaidPlanSignIn = Boolean(plan && plan !== "free");

  // Build callback URL with team_invite token if present
  let callbackURL = searchParams.get("callbackURL") || "/dashboard";
  if (teamInviteToken) {
    // Redirect to teams page with accept_token after auth
    callbackURL = `/dashboard/teams?accept_token=${encodeURIComponent(teamInviteToken)}`;
  }

  // Track if we've stored the checkout to avoid re-storing on every render
  const hasStoredCheckoutRef = useRef(false);

  // Store pending checkout info when plan params are present (only once)
  useEffect(() => {
    if (isPaidPlanSignIn && plan && !hasStoredCheckoutRef.current) {
      hasStoredCheckoutRef.current = true;
      storePendingCheckout(plan, billing);
    }
  }, [plan, billing, isPaidPlanSignIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setNeedsVerification(false);
    setVerificationSent(false);
  };

  // Known Better Auth error codes for email verification
  const EMAIL_VERIFICATION_ERROR_CODES = [
    "EMAIL_NOT_VERIFIED",
    "VERIFICATION_REQUIRED",
  ];

  /**
   * Handle post-sign-in actions (checkout flow)
   */
  const handlePostSignInActions = async () => {
    await handlePostAuthCheckout(callbackURL, router);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setNeedsVerification(false);
    setVerificationSent(false);

    try {
      const { error } = await signIn.email({
        email: formData.email,
        password: formData.password,
        callbackURL,
      });

      if (error) {
        // Check if the error is about email verification using error code (more reliable)
        const errorCode = (error as { code?: string }).code;
        const isVerificationError =
          error.status === 403 ||
          (errorCode && EMAIL_VERIFICATION_ERROR_CODES.includes(errorCode)) ||
          // Fallback: only check for exact "email not verified" phrase (more specific than just "verify")
          error.message?.toLowerCase() === "email not verified";

        if (isVerificationError) {
          setNeedsVerification(true);
          setVerificationEmail(formData.email);
        } else if (
          error.status === 401 ||
          error.message?.toLowerCase().includes("invalid credentials") ||
          error.message?.toLowerCase().includes("invalid email or password")
        ) {
          setError("Invalid email or password");
        } else {
          setError(error.message || "Failed to sign in");
        }
      } else {
        // Sign in successful - handle post-sign-in actions
        await handlePostSignInActions();
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setVerificationSent(false);
    setError(null);
    try {
      await sendVerificationEmail({
        email: verificationEmail,
        callbackURL,
      });
      setVerificationSent(true);
    } catch (err) {
      console.error("Failed to resend verification email:", err);
      setError("Failed to send verification email. Please try again.");
    } finally {
      setResendingVerification(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      // For Google OAuth, the checkout will be triggered after the OAuth callback
      // The pending checkout info is stored in sessionStorage and will be picked up
      // on the dashboard via the checkout_pending flag
      await signIn.social({
        provider: "google",
        callbackURL: buildOAuthCallbackURL(callbackURL, isPaidPlanSignIn),
      });
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to Luframe</CardTitle>
          <CardDescription>
            Sign in to start your AI-powered meetings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan upgrade notice from landing page */}
          {isPaidPlanSignIn && plan && (
            <div className="rounded-md bg-primary/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-primary">
                  Upgrading to{" "}
                  <span className="font-semibold">{formatPlanName(plan)}</span>
                </span>
                <Badge variant="secondary" className="capitalize">
                  {billing}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                You&apos;ll be taken to checkout after signing in.
              </p>
            </div>
          )}

          {/* Email verified notice */}
          {verified === "true" && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600">
              Your email has been verified! You can now sign in.
            </div>
          )}

          {/* Team invitation notice */}
          {teamInviteToken && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              You&apos;ve been invited to join a team. Sign in to accept the invitation.
            </div>
          )}

          {/* Email verification needed */}
          {needsVerification && (
            <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700">
              <p className="mb-2">
                Please verify your email address before signing in.
              </p>
              {verificationSent ? (
                <p className="text-green-600">
                  Verification email sent! Check your inbox.
                </p>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-amber-700 underline"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? "Sending..." : "Resend verification email"}
                </Button>
              )}
            </div>
          )}

          {(error || authError) && !needsVerification && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error || "Authentication failed. Please try again."}
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Your password"
                value={formData.password}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Sign In - follows Google branding guidelines */}
          <button
            type="button"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-input bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f1f]"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <>
                <Spinner className="size-5" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="size-5" />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="text-primary underline hover:no-underline">
              Sign up
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Welcome to Luframe</CardTitle>
              <CardDescription>
                Sign in to start your AI-powered meetings
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center py-8">
              <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </CardContent>
          </Card>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
