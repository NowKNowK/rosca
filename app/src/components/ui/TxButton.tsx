import type { ReactNode } from "react";
import type { TxState } from "../../hooks/useSendTx";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 border-transparent",
  secondary: "bg-slate-600 text-white hover:bg-slate-500 border-transparent",
  danger: "bg-red-700 text-white hover:bg-red-600 border-transparent",
  ghost: "bg-transparent text-slate-400 hover:bg-slate-800 border-slate-600",
};

type Props = {
  onClick: () => void;
  state?: TxState;
  disabled?: boolean;
  disabledReason?: string;
  variant?: Variant;
  size?: "sm" | "md";
  children: ReactNode;
};

export function TxButton({
  onClick,
  state = "idle",
  disabled = false,
  disabledReason,
  variant = "primary",
  size = "md",
  children,
}: Props) {
  const isLoading = state !== "idle" && state !== "error" && state !== "success";
  const isDisabled = disabled || isLoading;

  const sizeClass = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";

  const label =
    state === "signing"
      ? "Approve in wallet…"
      : state === "confirming"
      ? "Confirming…"
      : state === "building"
      ? "Building…"
      : children;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={isDisabled}
        className={`
          inline-flex items-center gap-1.5 font-medium rounded border transition-colors
          ${sizeClass}
          ${variantClass[variant]}
          ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {isLoading && (
          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        {label}
      </button>

      {disabled && disabledReason && (
        <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-50">
          <div className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap max-w-xs">
            {disabledReason}
          </div>
        </div>
      )}
    </div>
  );
}
