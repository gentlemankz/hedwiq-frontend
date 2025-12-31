"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp, signIn } from "@/lib/auth-client";
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
import { TermsPrivacyLinks } from "@/components/legal";

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const teamInviteToken = searchParams.get("team_invite");
  const authError = searchParams.get("error");

  // Plan selection from landing page (e.g., ?plan=pro&billing=annual)
  const plan = searchParams.get("plan");
  const billing = searchParams.get("billing") || "annual"; // Default to annual for better value

  // Check if this is a paid plan signup (not free)
  const isPaidPlanSignup = Boolean(plan && plan !== "free");

  // Build callback URL with team_invite token if present
  let callbackURL = searchParams.get("callbackURL") || "/dashboard";
  if (teamInviteToken) {
    callbackURL = `/dashboard/teams?accept_token=${encodeURIComponent(teamInviteToken)}`;
  }

  // Track if we've stored the checkout to avoid re-storing on every render
  const hasStoredCheckoutRef = useRef(false);

  // Store pending checkout info when plan params are present (only once)
  useEffect(() => {
    if (isPaidPlanSignup && plan && !hasStoredCheckoutRef.current) {
      hasStoredCheckoutRef.current = true;
      storePendingCheckout(plan, billing);
    }
  }, [plan, billing, isPaidPlanSignup]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  /**
   * Handle post-signup actions (checkout flow)
   */
  const handlePostSignupActions = async () => {
    await handlePostAuthCheckout(callbackURL, router);
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await signUp.email({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        callbackURL,
      });

      if (error) {
        if (error.message?.includes("already exists") || error.message?.includes("already registered")) {
          setError("An account with this email already exists. Please sign in instead.");
        } else {
          setError(error.message || "Failed to create account");
        }
      } else {
        // Account created successfully - handle post-signup actions
        await handlePostSignupActions();
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError("Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      // For Google OAuth, the checkout will be triggered after the OAuth callback
      // The pending checkout info is stored in sessionStorage and will be picked up
      // on the dashboard via the checkout_pending flag
      await signIn.social({
        provider: "google",
        callbackURL: buildOAuthCallbackURL(callbackURL, isPaidPlanSignup),
      });
    } catch (err) {
      console.error("Google sign up error:", err);
      setError("Failed to sign up with Google. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <CardDescription>
            Sign up to start your AI-powered meetings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan selection notice from landing page */}
          {isPaidPlanSignup && plan && (
            <div className="rounded-md bg-primary/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-primary">
                  You&apos;re signing up for the{" "}
                  <span className="font-semibold">{formatPlanName(plan)}</span> plan
                </span>
                <Badge variant="secondary" className="capitalize">
                  {billing}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                You&apos;ll be taken to checkout after creating your account.
              </p>
            </div>
          )}

          {/* Team invitation notice */}
          {teamInviteToken && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              You&apos;ve been invited to join a team. Create an account to accept the invitation.
            </div>
          )}

          {(error || authError) && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error || "Authentication failed. Please try again."}
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Creating account...
                </span>
              ) : (
                "Create account"
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

          {/* Google Sign Up - follows Google branding guidelines */}
          <button
            type="button"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-input bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f1f]"
            onClick={handleGoogleSignUp}
            disabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <>
                <Spinner className="size-5" />
                <span>Signing up...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="size-5" />
                <span>Sign up with Google</span>
              </>
            )}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary underline hover:no-underline">
              Sign in
            </Link>
          </p>
          <TermsPrivacyLinks action="signing up" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
              <CardDescription>
                Sign up to start your AI-powered meetings
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center py-8">
              <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </CardContent>
          </Card>
        </div>
      }
    >
      <SignUpContent />
    </Suspense>
  );
}
