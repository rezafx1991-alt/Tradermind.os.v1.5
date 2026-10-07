/**
 * ReplayErrorBoundary — Prompt 4 (Part 6)
 * جداسازی خطاهای بخش Trade Replay از بقیه برنامه
 */
import { Component, ReactNode } from 'react';
import { errorService } from '../../services/errorService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { hasError: boolean; message: string }

export class ReplayErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    let userMessage = 'خطا در بازپخش معامله. داده‌های شما محفوظ است.';
    if (msg.includes('canvas') || msg.includes('Canvas') || msg.includes('NaN') || msg.includes('Infinity')) {
      userMessage = 'دادهٔ نمودار ری‌پلی قابل نمایش نیست. دیتاست را دوباره انتخاب یا وارد کنید.';
    } else if (msg.includes('dataset') || msg.includes('replay')) {
      userMessage = 'داده‌های بازپخش ناقص است. لطفاً معامله را مجدداً انتخاب کنید.';
    }
    return { hasError: true, message: userMessage };
  }

  componentDidCatch(error: Error): void {
    errorService.logError('ReplayErrorBoundary', error, {
      severity: 'error',
      userAction: 'بازپخش معامله',
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div dir="rtl" className="flex flex-col items-center justify-center p-8 gap-4 text-center rounded-xl border border-blue-500/30 bg-blue-500/5">
          <div className="text-4xl">🎬</div>
          <h3 className="font-semibold text-blue-600 dark:text-blue-400">خطا در بازپخش</h3>
          <p className="text-sm text-muted-foreground max-w-xs">{this.state.message}</p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            تلاش دوباره
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
