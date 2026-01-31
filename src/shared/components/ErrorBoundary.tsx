import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Error screen colors: bright green on black
const textColor = 'hsl(116, 100%, 53%)'; // #1fff0f
const bgColor = 'hsl(0, 0%, 0%)'; // #000000

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
          style={{ backgroundColor: bgColor }}
        >
          <p
            className="text-base leading-relaxed font-mono font-bold"
            style={{ color: textColor }}
          >
            something went wrong
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
