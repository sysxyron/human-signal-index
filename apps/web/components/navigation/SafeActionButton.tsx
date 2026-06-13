'use client';

// =============================================================================
// HSI — SafeActionButton (Post-V1 navigation audit, Task 11).
//
// A guard against silent, dead UI controls. Every SafeActionButton MUST resolve
// to exactly one behaviour:
//   * `href`           → renders a real navigation link (Next <Link>).
//   * `onClick`        → renders an interactive button.
//   * `disabledReason` → renders a visibly disabled button with a tooltip
//                        explaining why it is inactive in this view.
//
// If NONE of the three is supplied, in development it logs a warning and renders
// a disabled button (never a silently clickable no-op). This makes "button that
// does nothing" impossible to ship unnoticed.
//
// Visual parity with @hsi/ui Button (variant/size/className/children pass through).
// =============================================================================

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@hsi/ui';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface SafeActionButtonProps {
  children: ReactNode;
  /** Navigation target. Mutually exclusive with onClick. */
  href?: string;
  /** Click handler for an in-page action. Mutually exclusive with href. */
  onClick?: () => void;
  /** If the control is intentionally inactive, the human-readable reason why.
   *  Rendered as a tooltip on a disabled button. */
  disabledReason?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** When true, the link opens in a new tab. */
  external?: boolean;
  type?: 'button' | 'submit';
}

export function SafeActionButton({
  children,
  href,
  onClick,
  disabledReason,
  variant = 'primary',
  size = 'sm',
  className,
  external = false,
  type = 'button',
}: SafeActionButtonProps) {
  // 1. Navigation link.
  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button variant={variant} size={size} className={className} type={type}>
            {children}
          </Button>
        </a>
      );
    }
    return (
      <Link href={href as never} className="inline-flex">
        <Button variant={variant} size={size} className={className} type={type}>
          {children}
        </Button>
      </Link>
    );
  }

  // 2. Interactive action.
  if (onClick) {
    return (
      <Button variant={variant} size={size} className={className} type={type} onClick={onClick}>
        {children}
      </Button>
    );
  }

  // 3. Intentionally disabled — visible, with a reason.
  if (disabledReason) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        type="button"
        disabled
        aria-disabled
        title={disabledReason}
      >
        {children}
      </Button>
    );
  }

  // 4. Misconfiguration guard — never ship a silent dead control.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[SafeActionButton] rendered without href, onClick, or disabledReason — ' +
        'this would be a dead control. Provide one. Children:',
      children,
    );
  }
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      type="button"
      disabled
      aria-disabled
      title="This action is not available."
    >
      {children}
    </Button>
  );
}
