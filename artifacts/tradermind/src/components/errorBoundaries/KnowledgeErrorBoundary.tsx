/**
 * KnowledgeErrorBoundary — Prompt 4 (Part 6)
 * جداسازی خطاهای بخش دانش‌نامه از بقیه برنامه
 */
import { Component, ReactNode } from 'react';
import { errorService } from '../../services/errorService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { hasError: boolean; message: string }

export class KnowledgeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    let userMessage = 'خطا در بارگذاری دانش‌نامه. نوشته‌های شما محفوظ است.';
    if (msg.includes('render') || msg.includes('markdown')) {
      userMessage = 'خطا در نمایش محتوا. لطفاً صفحه را رفرش کنید.';
    }
    return { hasError: true, message: userMessage };
  }

  componentDidCatch(error: Error): void {
    errorService.logError('KnowledgeErrorBoundary', error, {
      severity: 'error',
      userAction: 'مشاهده دانش‌نامه',
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div dir="rtl" className="flex flex-col items-center justify-center p-8 gap-4 text-center rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="text-4xl">📚</div>
          <h3 className="font-semibold text-amber-600 dark:text-amber-400">خطا در دانش‌نامه</h3>
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
