import * as React from 'react';
import { cn } from '@/lib/utils';
import { captureInputSelection, restoreInputSelection } from '@/lib/inputSelection';

export interface InputProps extends React.ComponentProps<'input'> {
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputMode, autoCorrect, spellCheck, onChange, ...props }, ref) => {
    const resolvedType = type ?? 'text';
    const isTextInput = resolvedType === 'text';
    const preserveCaret = ['text', 'search', 'tel', 'url', 'email', 'password'].includes(resolvedType);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      // React normally keeps the caret stable, but Android WebView + RTL controlled
      // inputs can move it to the end after each parent re-render. Capture the
      // browser's selection before notifying the controlled value owner and restore
      // it after React has committed the new value.
      const target = event.currentTarget;
       const selection = captureInputSelection(target);
      onChange?.(event);
       if (!preserveCaret || selection.start === null || selection.end === null) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
         restoreInputSelection(target, selection);
      });
    };

    return (
    <input
      type={resolvedType}
      inputMode={inputMode ?? (isTextInput ? 'text' : undefined)}
      autoCorrect={autoCorrect ?? (isTextInput ? 'on' : undefined)}
      spellCheck={spellCheck ?? (isTextInput ? true : undefined)}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      ref={ref}
      onChange={handleChange}
      {...props}
    />
    );
  },
);

Input.displayName = 'Input';
export { Input };
