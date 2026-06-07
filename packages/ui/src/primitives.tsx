import {
  type ComponentPropsWithRef,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils';

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds an interactive hover border-glow. */
  interactive?: boolean;
  /** Adds extra inner padding. Default true. */
  padded?: boolean;
}

export function Card({
  className = '',
  children,
  interactive = false,
  padded = true,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'glass-card rounded-card border border-border bg-surface/80',
        padded && 'p-6',
        interactive &&
          'transition duration-200 hover:border-electric/60 hover:shadow-glow',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary border-transparent text-white shadow-[0_14px_40px_-12px_rgba(37,99,235,0.7)] hover:bg-[#1E56D6] hover:shadow-[0_18px_50px_-12px_rgba(37,99,235,0.85)]',
  secondary:
    'bg-transparent border-border text-text-primary hover:border-electric hover:text-white hover:bg-electric/5',
  danger:
    'bg-risk border-transparent text-white shadow-[0_14px_40px_-12px_rgba(239,68,68,0.6)] hover:bg-[#dc2626]',
  ghost:
    'bg-surface-2/60 border-transparent text-text-secondary hover:bg-surface-3 hover:text-white',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-[13px]',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-[15px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn border font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/70 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

export interface InputProps extends ComponentPropsWithRef<'input'> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', label, hint, id, ...props },
  ref,
) {
  const inputEl = (
    <input
      ref={ref}
      id={id}
      className={cn(
        'w-full rounded-btn border border-border bg-surface/90 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/25',
        className,
      )}
      {...props}
    />
  );
  if (!label && !hint) return inputEl;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={id} className="block text-label text-text-secondary">
          {label}
        </label>
      ) : null}
      {inputEl}
      {hint ? <p className="text-caption text-text-muted">{hint}</p> : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Textarea                                                                     */
/* -------------------------------------------------------------------------- */

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = '', label, id, ...props }, ref) {
    const el = (
      <textarea
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-btn border border-border bg-surface/90 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/25',
          className,
        )}
        {...props}
      />
    );
    if (!label) return el;
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-label text-text-secondary">
          {label}
        </label>
        {el}
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Select                                                                       */
/* -------------------------------------------------------------------------- */

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', label, id, children, ...props },
  ref,
) {
  const el = (
    <div className="relative">
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full appearance-none rounded-btn border border-border bg-surface/90 px-4 py-2.5 pr-10 text-sm text-text-primary outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/25',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    </div>
  );
  if (!label) return el;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-label text-text-secondary">
        {label}
      </label>
      {el}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Table                                                                        */
/* -------------------------------------------------------------------------- */

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  className?: string;
}

export function Table<T>({ columns, data, rowKey, className = '' }: TableProps<T>) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-card border border-border bg-surface/60',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-5 py-3.5 text-label font-semibold text-text-muted',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  (!col.align || col.align === 'left') && 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-border/60 transition last:border-0 hover:bg-surface-2/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-5 py-3.5 text-text-secondary',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section primitives                                                           */
/* -------------------------------------------------------------------------- */

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-label text-electric">
      <span className="h-1 w-1 rounded-full bg-electric" />
      {children}
    </span>
  );
}
