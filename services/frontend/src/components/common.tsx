import React from 'react';

export function Card({ title, icon, children, className, right, style }: { title?: string; icon?: string; children: React.ReactNode; className?: string; right?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`card ${className ?? ''}`} style={style}>
      {title && <h3><span className="ic">{icon}</span>{title}{right && <span style={{ marginInlineStart: 'auto' }}>{right}</span>}</h3>}
      {children}
    </div>
  );
}

export function Button({ variant = 'default', children, ...p }: { variant?: 'default' | 'pri' | 'blue' | 'warn' | 'ghost'; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${variant}`} {...p}>{children}</button>;
}

export function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: 'acc' | 'blue' | 'org' | 'red' | 'prp' }) {
  return (
    <div className="card kpi">
      <h3 style={{ marginBottom: 8 }}>{label}</h3>
      <div className={`v ${color ?? ''}`}>{value}</div>
      {sub && <div className="u">{sub}</div>}
    </div>
  );
}

export function Tag({ kind = 'ok', children, style }: { kind?: 'ok' | 'wn' | 'bad' | 'bl'; children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className={`tag ${kind}`} style={style}>{children}</span>;
}

export function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="mstat">
      <span className="mv">{value}</span>
      <span className="ml">{label}</span>
    </div>
  );
}

export function Toasts() {
  const toasts = useStoreToasts();
  return (
    <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`tag ${t.kind === 'info' ? 'bl' : t.kind}`} style={{ padding: '8px 14px', fontSize: 12, boxShadow: 'var(--sh-md)' }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
// small hook to avoid circular import
import { useStore } from '../store';
function useStoreToasts() { return useStore((s) => s.toasts); }
