"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

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

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="relative card-hover flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-[#1E1E2A] bg-[#111118] p-8">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <AlertTriangle className="h-8 w-8 text-[#f59e0b]" />
          <h2 className="text-lg font-semibold text-[#e2e8f0]">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-[#64748b]">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 rounded-xl border border-[#1E1E2A] bg-[#0A0A0C] px-4 py-2 text-sm text-[#e2e8f0] transition hover:border-[#3E3E4A]"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
