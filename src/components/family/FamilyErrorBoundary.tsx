"use client";

import { Component, ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class FamilyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("FamilyClient error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="space-y-4">
          <Alert variant="danger">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <strong>Something went wrong</strong>
            </div>
            <p className="mt-2 text-[13px] text-text-secondary">
              An unexpected error occurred while loading the family sharing page.
            </p>
            {this.state.error && (
              <details className="mt-2">
                <summary className="text-[11px] text-text-muted cursor-pointer">
                  Error details
                </summary>
                <pre className="mt-2 p-2 rounded bg-surface text-[11px] overflow-auto text-text-secondary">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </Alert>
          <Button variant="primary" onClick={this.handleRetry} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
