"use client";

import React, { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specifically for the transcription feature.
 * Catches errors in the transcription sidebar and provides a recovery UI.
 */
export class TranscriptionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("TranscriptionErrorBoundary caught an error:", error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 border-l bg-background p-6 text-center">
          <AlertTriangle className="size-10 text-destructive" />
          <div className="space-y-2">
            <h3 className="font-semibold">Transcription Error</h3>
            <p className="text-sm text-muted-foreground">
              Something went wrong with the transcription feature.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <p className="text-xs text-destructive font-mono max-w-xs truncate">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
