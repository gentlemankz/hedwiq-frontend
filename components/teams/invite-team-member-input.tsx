"use client";

import { useState, useCallback, useMemo } from "react";
import { X, Plus, Mail, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isValidEmail, normalizeEmail } from "@/lib/validation/invitee";
import { TEAM_LIMITS, type TeamRole } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

export interface TeamInviteEntry {
  email: string;
  role: TeamRole;
  /** Whether this is an external invite (user doesn't have an account) */
  isExternal?: boolean;
}

interface InviteTeamMemberInputProps {
  /** Current list of invites */
  invites: TeamInviteEntry[];
  /** Callback when invites change */
  onChange: (invites: TeamInviteEntry[]) => void;
  /** Maximum number of invites allowed */
  maxInvites?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Placeholder text for the email input */
  placeholder?: string;
  /** Default role for new invites */
  defaultRole?: TeamRole;
  /** Whether to show the role selector */
  showRoleSelector?: boolean;
  /** Existing team member emails to exclude from suggestions */
  existingMemberEmails?: string[];
  /**
   * Function to check if an email has an account.
   * If provided, will mark invites as external for non-registered users.
   */
  checkEmailHasAccount?: (email: string) => Promise<boolean>;
  /** Whether to show external invite indicators */
  showExternalIndicator?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function InviteTeamMemberInput({
  invites,
  onChange,
  maxInvites = TEAM_LIMITS.MAX_PENDING_INVITES,
  disabled = false,
  placeholder = "Enter email address",
  defaultRole = "member",
  showRoleSelector = true,
  existingMemberEmails = [],
  checkEmailHasAccount,
  showExternalIndicator = true,
}: InviteTeamMemberInputProps) {
  const [emailInput, setEmailInput] = useState("");
  const [selectedRole, setSelectedRole] = useState<TeamRole>(defaultRole);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Memoize normalized existing emails to avoid recreating on every render
  const normalizedExistingMemberEmails = useMemo(
    () => existingMemberEmails.map((e) => normalizeEmail(e)),
    [existingMemberEmails]
  );

  const addInvite = useCallback(async () => {
    const email = normalizeEmail(emailInput);
    setError(null);

    // Validate email
    if (!email) {
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    // Build set of existing emails inside callback to avoid stale closure
    const allExistingEmails = new Set([
      ...normalizedExistingMemberEmails,
      ...invites.map((inv) => inv.email),
    ]);

    // Check for duplicates (including existing members)
    if (allExistingEmails.has(email)) {
      if (normalizedExistingMemberEmails.includes(email)) {
        setError("This email is already in use");
      } else {
        setError("This email has already been added");
      }
      return;
    }

    // Check max limit
    if (invites.length >= maxInvites) {
      setError(`Maximum ${maxInvites} invites allowed`);
      return;
    }

    // Check if user has an account (if checkEmailHasAccount is provided)
    let isExternal = false;
    if (checkEmailHasAccount) {
      setIsChecking(true);
      try {
        const hasAccount = await checkEmailHasAccount(email);
        isExternal = !hasAccount;
      } catch {
        // If check fails, assume internal invite
        isExternal = false;
      } finally {
        setIsChecking(false);
      }
    }

    // Add invite
    onChange([...invites, { email, role: selectedRole, isExternal }]);
    setEmailInput("");
  }, [emailInput, invites, maxInvites, onChange, selectedRole, normalizedExistingMemberEmails, checkEmailHasAccount]);

  const removeInvite = useCallback(
    (emailToRemove: string) => {
      onChange(invites.filter((inv) => inv.email !== emailToRemove));
    },
    [invites, onChange]
  );

  const updateInviteRole = useCallback(
    (email: string, newRole: TeamRole) => {
      onChange(
        invites.map((inv) =>
          inv.email === email ? { ...inv, role: newRole } : inv
        )
      );
    },
    [invites, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void addInvite();
    }
  };

  // Count external invites for display
  const externalInviteCount = invites.filter((inv) => inv.isExternal).length;

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");

    // Check if pasted text contains multiple emails (comma, newline, or semicolon separated)
    const potentialEmails = pastedText
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (potentialEmails.length > 1) {
      e.preventDefault();

      const currentExistingEmails = new Set([
        ...normalizedExistingMemberEmails,
        ...invites.map((inv) => inv.email),
      ]);
      const newInvites: TeamInviteEntry[] = [];

      for (const emailStr of potentialEmails) {
        const normalized = normalizeEmail(emailStr);
        if (
          isValidEmail(normalized) &&
          !currentExistingEmails.has(normalized) &&
          invites.length + newInvites.length < maxInvites
        ) {
          newInvites.push({ email: normalized, role: selectedRole });
          currentExistingEmails.add(normalized);
        }
      }

      if (newInvites.length > 0) {
        onChange([...invites, ...newInvites]);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Invite Members</Label>
        {invites.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({invites.length} pending)
          </span>
        )}
      </div>

      {/* Email Input */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            type="email"
            placeholder={placeholder}
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || invites.length >= maxInvites}
            className={cn(error && "border-destructive")}
          />
        </div>
        {showRoleSelector && (
          <Select
            value={selectedRole}
            onValueChange={(v) => setSelectedRole(v as TeamRole)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void addInvite()}
          disabled={disabled || !emailInput || invites.length >= maxInvites || isChecking}
        >
          {isChecking ? (
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
      </div>

      {/* Error Message */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Helper Text */}
      <p className="text-xs text-muted-foreground">
        Press Enter to add. Paste multiple emails separated by commas.
      </p>

      {/* External invite notice */}
      {showExternalIndicator && externalInviteCount > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="size-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-medium">
              {externalInviteCount} {externalInviteCount === 1 ? "person doesn't" : "people don't"} have a Hedwiq account yet.
            </span>
            <br />
            They&apos;ll receive an invitation to sign up and join your team.
          </div>
        </div>
      )}

      {/* Invite List */}
      {invites.length > 0 && (
        <TooltipProvider>
          <div className="flex flex-wrap gap-2">
            {invites.map((invite) => (
              <Badge
                key={invite.email}
                variant={invite.isExternal ? "outline" : "secondary"}
                className={cn(
                  "gap-1 py-1 pr-1 pl-2",
                  invite.isExternal && "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                )}
              >
                {showExternalIndicator && invite.isExternal && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <UserPlus className="size-3 text-amber-600 dark:text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">Will receive signup invitation</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <span className="max-w-[180px] truncate">{invite.email}</span>
                {showRoleSelector && (
                  <Select
                    value={invite.role}
                    onValueChange={(v) =>
                      updateInviteRole(invite.email, v as TeamRole)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-5 w-[70px] text-xs border-0 bg-transparent px-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <button
                  type="button"
                  onClick={() => removeInvite(invite.email)}
                  disabled={disabled}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                  <span className="sr-only">Remove {invite.email}</span>
                </button>
              </Badge>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
