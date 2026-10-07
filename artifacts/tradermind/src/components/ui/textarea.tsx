import * as React from 'react';
import { cn } from '@/lib/utils';
import { captureInputSelection, restoreInputSelection } from '@/lib/inputSelection';

export interface TextareaProps extends React.ComponentProps<'textarea'> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, inputMode, autoCorrect, spellCheck, enterKeyHint, wrap, onChange, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
       const selection = captureInputSelection(target);
      onChange?.(event);
       if (selection.start === null || selection.end === null) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
         restoreInputSelection(target, selection);
      });
    };

    return (
      <textarea
        inputMode={inputMode ?? 'text'}
        autoCorrect={autoCorrect ?? 'on'}
        spellCheck={spellCheck ?? true}
        enterKeyHint={enterKeyHint ?? 'enter'}
        wrap={wrap ?? 'soft'}
        className={cn(
        'flex min-h-[60px] w-full whitespace-pre-wrap rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
export { Textarea };
