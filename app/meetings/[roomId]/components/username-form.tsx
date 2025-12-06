"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validateUsername,
  sanitizeUsername,
  USERNAME_MAX_LENGTH,
} from "@/lib/validation";

interface UsernameFormProps {
  initialUsername: string;
  isConnecting: boolean;
  isValid: boolean;
  onSubmit: (username: string) => void;
}

/**
 * Username input form with validation.
 */
export function UsernameForm({
  initialUsername,
  isConnecting,
  isValid: externalIsValid,
  onSubmit,
}: UsernameFormProps) {
  const [username, setUsername] = useState(initialUsername);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Memoize validation result
  const validationResult = useMemo(
    () => validateUsername(username),
    [username]
  );
  const isValid = validationResult.isValid && externalIsValid;

  // Handle username change
  const handleUsernameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, USERNAME_MAX_LENGTH);
      setUsername(value);
      if (usernameError) {
        setUsernameError(null);
      }
    },
    [usernameError]
  );

  // Validate on blur
  const handleUsernameBlur = useCallback(() => {
    const validation = validateUsername(username);
    if (!validation.isValid) {
      setUsernameError(validation.error || null);
    }
  }, [username]);

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!validationResult.isValid) {
        setUsernameError(validationResult.error || null);
        return;
      }

      onSubmit(sanitizeUsername(username));
    },
    [validationResult, username, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="username">Display Name</Label>
        <Input
          id="username"
          value={username}
          onChange={handleUsernameChange}
          onBlur={handleUsernameBlur}
          placeholder="Enter your name"
          autoComplete="off"
          maxLength={USERNAME_MAX_LENGTH}
          aria-invalid={!!usernameError}
          aria-describedby={usernameError ? "username-error" : undefined}
        />
        {usernameError && (
          <p id="username-error" className="text-sm text-destructive">
            {usernameError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {username.length}/{USERNAME_MAX_LENGTH} characters
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!isValid || isConnecting}
      >
        {isConnecting ? "Joining..." : "Join Meeting"}
      </Button>
    </form>
  );
}

export { USERNAME_MAX_LENGTH };
