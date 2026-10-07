import { Component, type ReactNode } from 'react';
import { errorService } from '../../services/errorService';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ScreenshotErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    errorService.logError('ScreenshotErrorBoundary', error, {
      severity: 'error',
      userAction: 'هوش اسکرین‌شات',
      context: { path: window.location.pathname },
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center p-8 gap-4 text-center rounded-xl border border-violet-500/30 bg-violet-500/5">
        <div className="text-4xl">🖼️</div>
        <h2 className="font-semibold">هوش اسکرین‌شات موقتاً قابل بارگذاری نیست</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          داده‌های شما محفوظ است. می‌توانید دوباره تلاش کنید یا به گالری برگردید.
        </p>
        <button onClick={this.retry} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          تلاش دوباره
        </button>
      </div>
    );
  }
}