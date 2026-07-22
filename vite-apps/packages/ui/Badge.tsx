import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
};

/** Общий UI из vite-apps/packages (не npm-пакет). */
export function Badge({ children }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.55rem',
        borderRadius: '0.35rem',
        background: '#e8eef7',
        color: '#1a3a5c',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
