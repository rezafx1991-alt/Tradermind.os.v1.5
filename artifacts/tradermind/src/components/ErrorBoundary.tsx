import { Component, ReactNode } from "react";
import { errorService } from '../services/errorService';
import { isChunkLoadError, recoverFromChunkLoadError } from '../lib/runtimeRecovery';

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string; isChunkError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    const chunkError = isChunkLoadError(error);
    let userMessage = 'یک خطای پیش‌بینی‌نشده رخ داد.';
    if (chunkError) {
      userMessage = 'نسخهٔ بخشی از برنامه قدیمی یا ناقص است. برنامه برای پاک‌سازی و بارگذاری نسخهٔ سالم دوباره باز می‌شود.';
    } else if (msg.includes('storage') || msg.includes('quota') || msg.includes('QuotaExceeded')) {
      userMessage = 'ذخیره اطلاعات انجام نشد. لطفاً فضای ذخیره‌سازی دستگاه را بررسی کنید.';
    } else if (msg.includes('database') || msg.includes('IndexedDB') || msg.includes('Dexie')) {
      userMessage = 'خطا در پایگاه داده محلی. لطفاً برنامه را دوباره باز کنید.';
    } else if (msg.includes('import') || msg.includes('restore') || msg.includes('parse')) {
      userMessage = 'فایل نامعتبر است. لطفاً فایل پشتیبان را بررسی کنید.';
    }
    return { hasError: true, message: userMessage, isChunkError: chunkError };
  }

  componentDidCatch(error: Error) {
    errorService.logError('ErrorBoundary', error, {
      severity: 'error',
      userAction: 'نمایش صفحه خطا',
      context: { chunkError: isChunkLoadError(error), path: window.location.pathname },
    });
  }

  private handleRetry = () => {
    if (this.state.isChunkError) {
      recoverFromChunkLoadError();
      return;
    }
    this.setState({ hasError: false, message: '', isChunkError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-5xl">⚠️</div>
            <h2 className="text-xl font-bold">مشکلی پیش آمد</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{this.state.message}</p>
            <div className="flex gap-3 justify-center">
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
        </div>
      );
    }
    return this.props.children;
  }
}
