'use client';

// =============================================================================
// HSI Phase 42 — shared homepage motion primitives (framer-motion).
//
// Reveal-on-scroll + fade-in wrappers used across the homepage. They respect the
// user's reduced-motion preference (via the accessibility center and the OS): when
// reduced motion is on, content renders immediately with no transform. PURPOSE:
// professional, research-grade motion — never gimmicky.
// =============================================================================

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Reveal a block as it scrolls into view (once). Falls back to no motion. */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A staggered container: direct <RevealItem> children animate in sequence. */
export function RevealGroup({ children, className, stagger = 0.08 }: { children: ReactNode; className?: string; stagger?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  const container: Variants = { hidden: {}, show: { transition: { staggerChildren: stagger } } };
  return (
    <motion.div className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, y = 14 }: { children: ReactNode; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  const item: Variants = { hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };
  return <motion.div className={className} variants={item}>{children}</motion.div>;
}

/** A gentle floating card (continuous, subtle). Disabled under reduced motion. */
export function Floating({ children, className, distance = 6, duration = 6 }: { children: ReactNode; className?: string; distance?: number; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -distance, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
