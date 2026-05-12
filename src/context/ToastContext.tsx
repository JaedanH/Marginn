import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg text-sm font-medium min-w-[300px] max-w-[420px] pointer-events-auto transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-[#1a3d2b] text-white'
                : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-900 text-white'
            }`}
          >
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i
                className={`text-base ${
                  toast.type === 'success'
                    ? 'ri-check-line'
                    : toast.type === 'error'
                    ? 'ri-error-warning-line'
                    : 'ri-information-line'
                }`}
              />
            </div>
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
