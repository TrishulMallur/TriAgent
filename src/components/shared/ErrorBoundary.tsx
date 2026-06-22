import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Card, Button } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
          <Card className="max-w-md text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-verdict-fail-bg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-verdict-fail" />
              </div>
              <h3 className="text-lg font-semibold text-ws-dark">Something went wrong</h3>
              <p className="text-sm text-ws-muted">
                {this.state.error?.message || 'An unexpected error occurred in this section.'}
              </p>
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
