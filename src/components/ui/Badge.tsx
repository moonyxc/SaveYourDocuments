import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple';
}

export function Badge({ children, color = 'blue' }: BadgeProps) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    gray: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    purple: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  );
}
