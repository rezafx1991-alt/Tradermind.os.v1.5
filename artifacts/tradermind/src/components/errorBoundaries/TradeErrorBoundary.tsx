/**
 * TradeErrorBoundary — Prompt 4 (Part 6)
 * جداسازی خطاهای بخش معاملات از بقیه برنامه
 */
import { Component, ReactNode } from 'react';
import { errorService } from '../../services/errorService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { hasError: boolean; message: string }

export class TradeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    let userMessage = 'خطا در بارگذاری معاملات. داده‌های شما محفوظ است.';
    if (msg.includes('IndexedDB') || msg.includes('Dexie') || msg.includes('database')) {
      userMessage = 'خطا در دسترسی به پایگاه داده معاملات. لطفاً برنامه را بازنشانی کنید.';
    } else if (msg.includes('migration') || msg.includes('upgrade')) {
      userMessage = 'خطا در به‌روزرسانی ساختار داده. لطفاً برنامه را مجدداً باز کنید.';
    }
    return { hasError: true, message: userMessage };
  }

  componentDidCatch(error: Error): void {
    errorService.logError('TradeErrorBoundary', error, {
      severity: 'critical',
      userAction: 'مدیریت معاملات',
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
          <div className="text-4xl">📈</div>
          <h3 className="font-semibold text-destructive">خطا در بخش معاملات</h3>
          <p className="text-sm text-muted-foreground max-w-xs">{this.state.message}</p>
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              تلاش دوباره
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md border text-sm font-medium"
            >
              بارگذاری مجدد
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
