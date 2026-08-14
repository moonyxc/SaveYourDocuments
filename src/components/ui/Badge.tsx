import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple';
}

export function Badge({ children, color = 'blue' }: BadgeProps) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  );
}
