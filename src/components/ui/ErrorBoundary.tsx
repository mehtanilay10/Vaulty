"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center text-center p-8 space-y-4">
          <AlertTriangle className="w-10 h-10 text-warning" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Something went wrong</h2>
            <p className="text-sm text-text-secondary max-w-md">
              {this.state.error?.message ||
                "An unexpected error occurred while rendering this section."}
            </p>
          </div>
          <Button onClick={this.handleReset} variant="secondary">
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
