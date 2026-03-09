import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <AlertTriangle className="h-10 w-10 text-destructive/70" />
              <h3 className="text-base font-semibold">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                This section encountered an error. The rest of the app is still working.
              </p>
              {this.state.error && (
                <p className="text-xs font-mono text-destructive/60 max-w-md truncate">
                  {this.state.error.message}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={this.handleRetry} className="mt-2">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
