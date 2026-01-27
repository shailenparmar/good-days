import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center h-screen p-8"
          style={{ backgroundColor: 'hsl(84, 100%, 94%)' }}
        >
          <div className="text-center">
            <p
              className="font-mono font-bold text-sm select-none"
              style={{ color: 'hsl(144, 36%, 43%)' }}
            >
              something went wrong
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 font-mono font-bold text-sm rounded"
              style={{
                color: 'hsl(144, 36%, 43%)',
                border: '3px solid hsl(144, 36%, 43%)',
                backgroundColor: 'transparent',
              }}
            >
              reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
