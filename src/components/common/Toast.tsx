import React, { useEffect, useRef, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setIsVisible(false);
      closeTimer = setTimeout(() => onCloseRef.current(), 300);
    }, duration);

    return () => {
      clearTimeout(timer);
      if (closeTimer) {
        clearTimeout(closeTimer);
      }
    };
  }, [duration]);

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-amber-600',
  };

  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white shadow-lg transition-opacity duration-300 ${colors[type]} ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{message}</span>
        <button type="button" onClick={onClose} aria-label="Schließen" className="ml-2 hover:opacity-75">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
