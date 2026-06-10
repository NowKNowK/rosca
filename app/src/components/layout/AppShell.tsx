import { Link, Outlet } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Toaster } from "sonner";
import { HistoryBadge } from "./HistoryBadge";

export function AppShell() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="font-semibold text-slate-100 text-sm tracking-tight">ROSCA</span>
            <span className="text-xs px-1.5 py-0.5 bg-sky-900/50 text-sky-400 rounded font-mono border border-sky-800">
              devnet
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <HistoryBadge />
            <WalletMultiButton
              style={{
                height: "32px",
                fontSize: "13px",
                padding: "0 12px",
                borderRadius: "6px",
                backgroundColor: "#4f46e5",
              }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      <Toaster position="bottom-right" richColors closeButton theme="dark" />
    </div>
  );
}
