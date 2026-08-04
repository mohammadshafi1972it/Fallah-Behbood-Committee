import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastNotificationProps {
  message: string | null;
  onClose: () => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ message, onClose }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-xl border border-slate-800 max-w-md w-full mx-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-white p-0.5 rounded-md hover:bg-slate-800">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
