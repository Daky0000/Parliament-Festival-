"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, Mail, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info" | "email";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  durationMs?: number;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const duration = toast.durationMs ?? 4500;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  const config = {
    email: {
      icon: Mail,
      border: "border-[#8FB2FF]/40",
      bg: "bg-[#0A1830]/95",
      accent: "text-[#8FB2FF]",
      bar: "bg-[#8FB2FF]",
    },
    success: {
      icon: CheckCircle2,
      border: "border-emerald-500/40",
      bg: "bg-[#062417]/95",
      accent: "text-emerald-400",
      bar: "bg-emerald-500",
    },
    warning: {
      icon: AlertTriangle,
      border: "border-amber-500/40",
      bg: "bg-[#291705]/95",
      accent: "text-amber-400",
      bar: "bg-amber-500",
    },
    error: {
      icon: AlertCircle,
      border: "border-rose-500/40",
      bg: "bg-[#2C0A0A]/95",
      accent: "text-rose-400",
      bar: "bg-rose-500",
    },
    info: {
      icon: Info,
      border: "border-blue-500/40",
      bg: "bg-[#0D1B35]/95",
      accent: "text-blue-400",
      bar: "bg-blue-500",
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={`pointer-events-auto relative overflow-hidden rounded-[14px] border ${config.border} ${config.bg} p-4 shadow-2xl backdrop-blur-md transition-all duration-300`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-1.5 rounded-lg bg-white/[0.06] ${config.accent}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white tracking-[-0.01em]">
              {toast.title}
            </span>
          </div>
          <p className="text-[12px] text-white/80 mt-0.5 leading-snug break-words">
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/40 hover:text-white p-1 rounded-md transition-colors"
          aria-label="Close notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.08]">
        <div
          className={`h-full ${config.bar} transition-all duration-75`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
