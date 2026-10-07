/**
 * AnalyticsErrorBoundary — Prompt 4 (Part 6)
 * جداسازی خطاهای بخش Analytics از بقیه برنامه
 */
import { Component, ReactNode } from 'react';
import { errorService } from '../../services/errorService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { hasError: boolean; message: string }

export class AnalyticsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    let userMessage = 'خطا در محاسبه تحلیل‌ها. داده‌های شما محفوظ است.';
    if (msg.includes('worker') || msg.includes('Worker')) {
      userMessage = 'Web Worker تحلیل با مشکل مواجه شد. در حال پردازش بدون Worker...';
    } else if (msg.includes('memory') || msg.includes('heap')) {
      userMessage = 'حافظه کافی برای پردازش تحلیل وجود ندارد. تعداد داده‌ها را کاهش دهید.';
    }
    return { hasError: true, message: userMessage };
  }

  componentDidCatch(error: Error): void {
    errorService.logError('AnalyticsErrorBoundary', error, {
      severity: 'error',
      userAction: 'مشاهده تحلیل‌ها',
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div dir="rtl" className="flex flex-col items-center justify-center p-8 gap-4 text-center rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="text-4xl">📊</div>
          <h3 className="font-semibold text-destructive">خطا در تحلیل‌ها</h3>
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
