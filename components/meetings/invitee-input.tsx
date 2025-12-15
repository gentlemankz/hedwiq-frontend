"use client";

import { useState, useCallback } from "react";
import { X, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isValidEmail, normalizeEmail } from "@/lib/validation/invitee";

// ============================================================================
// Types
// ============================================================================

export interface InviteeEntry {
  email: string;
  name?: string;
}

interface InviteeInputProps {
  /** Current list of invitees */
  invitees: InviteeEntry[];
  /** Callback when invitees change */
  onChange: (invitees: InviteeEntry[]) => void;
  /** Maximum number of invitees allowed */
  maxInvitees?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Placeholder text for the email input */
  placeholder?: string;
}

// ============================================================================
// Component
// ============================================================================

export function InviteeInput({
  invitees,
  onChange,
  maxInvitees = 50,
  disabled = false,
  placeholder = "Enter email address",
}: InviteeInputProps) {
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addInvitee = useCallback(() => {
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

    // Check for duplicates
    if (invitees.some((inv) => inv.email === email)) {
      setError("This email has already been added");
      return;
    }

    // Check max limit
    if (invitees.length >= maxInvitees) {
      setError(`Maximum ${maxInvitees} invitees allowed`);
      return;
    }

    // Add invitee
    onChange([...invitees, { email }]);
    setEmailInput("");
  }, [emailInput, invitees, maxInvitees, onChange]);

  const removeInvitee = useCallback(
    (emailToRemove: string) => {
      onChange(invitees.filter((inv) => inv.email !== emailToRemove));
    },
    [invitees, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addInvitee();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");

    // Check if pasted text contains multiple emails (comma or newline separated)
    const potentialEmails = pastedText
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (potentialEmails.length > 1) {
      e.preventDefault();

      const existingEmails = new Set(invitees.map((inv) => inv.email));
      const newInvitees: InviteeEntry[] = [];

      for (const email of potentialEmails) {
        const normalized = normalizeEmail(email);
        if (
          isValidEmail(normalized) &&
          !existingEmails.has(normalized) &&
          invitees.length + newInvitees.length < maxInvitees
        ) {
          newInvitees.push({ email: normalized });
          existingEmails.add(normalized);
        }
      }

      if (newInvitees.length > 0) {
        onChange([...invitees, ...newInvitees]);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Invite Participants</Label>
        {invitees.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({invitees.length} added)
          </span>
        )}
      </div>

      {/* Email Input */}
      <div className="flex gap-2">
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
          disabled={disabled || invitees.length >= maxInvitees}
          className={cn(error && "border-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={addInvitee}
          disabled={disabled || !emailInput || invitees.length >= maxInvitees}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Error Message */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Helper Text */}
      <p className="text-xs text-muted-foreground">
        Press Enter to add. Paste multiple emails separated by commas.
      </p>

      {/* Invitee List */}
      {invitees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {invitees.map((invitee) => (
            <Badge
              key={invitee.email}
              variant="secondary"
              className="gap-1 py-1 pr-1"
            >
              <span className="max-w-[200px] truncate">{invitee.email}</span>
              <button
                type="button"
                onClick={() => removeInvitee(invitee.email)}
                disabled={disabled}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
                <span className="sr-only">Remove {invitee.email}</span>
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
