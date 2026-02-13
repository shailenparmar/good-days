import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { flushPendingSaves } from '@shared/storage/journalStorage';
import { logAction } from '@shared/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Error screen colors: DEFAULT_PRESET_1 (dark navy on light yellow)
const textColor = 'hsl(236, 66%, 18%)';
const bgColor = 'hsl(52, 100%, 88%)';

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
    logAction('error.boundary', { message: error.message, componentStack: errorInfo.componentStack?.slice(0, 500) });
    // Emergency save: flush debounced writes to IndexedDB
    try {
      flushPendingSaves();
    } catch { /* best effort */ }
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
