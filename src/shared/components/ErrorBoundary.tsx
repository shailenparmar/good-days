import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { DEFAULT_PRESETS } from '@features/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Use preset 1 colors for error screen
const preset1 = DEFAULT_PRESETS[0];
const textColor = `hsl(${preset1.hue}, ${preset1.sat}%, ${preset1.light}%)`;
const bgColor = `hsl(${preset1.bgHue}, ${preset1.bgSat}%, ${preset1.bgLight}%)`;

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
