import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useMyCircles } from "../hooks/useMyCircles";
import { Card } from "../components/ui/Card";
import { CircleStatusBadge } from "../components/ui/StatusBadge";
import { AddressLabel } from "../components/ui/AddressLabel";
import { EmptyState } from "../components/ui/EmptyState";
import { circleStatusLabel, isCircleActive, isCircleFilling } from "../lib/rosca";
import { DEMO_CIRCLE_ADDRESS } from "../lib/constants";

export function HomePage() {
  const { publicKey, connected } = useWallet();
  const navigate = useNavigate();
  const [joinInput, setJoinInput] = useState("");

  const myCirclesQuery = useMyCircles(publicKey);
  const myCircles = myCirclesQuery.data ?? [];

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const addr = joinInput.trim();
    if (addr) navigate(`/circle/${addr}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">ROSCA Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Trustless rotating savings on Solana — no custody, no counterparty.
          </p>
        </div>
        {connected && (
          <Link
            to="/create"
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-500 transition-colors font-medium"
          >
            + Create circle
          </Link>
        )}
      </div>

      {/* Join by address */}
      <Card className="p-4">
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            type="text"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Enter circle address to view or join…"
            className="flex-1 px-3 py-2 text-sm border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono placeholder:font-sans placeholder:text-slate-500 bg-slate-800 text-slate-100"
          />
          <button
            type="submit"
            disabled={!joinInput.trim()}
            className="px-4 py-2 bg-slate-700 text-slate-100 text-sm rounded-md hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            View
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Demo circle:{" "}
          <Link
            to={`/circle/${DEMO_CIRCLE_ADDRESS}`}
            className="text-indigo-400 hover:underline font-mono"
          >
            {DEMO_CIRCLE_ADDRESS.slice(0, 8)}…
          </Link>
        </p>
      </Card>

      {/* My circles */}
      {!connected ? (
        <Card className="p-6 flex flex-col items-center gap-3">
          <p className="text-slate-400 text-sm">Connect a wallet to see your circles</p>
          <WalletMultiButton style={{ height: "36px", fontSize: "13px", borderRadius: "6px" }} />
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300">My Circles</h2>
          {myCirclesQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-slate-900 border border-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : myCircles.length === 0 ? (
            <EmptyState
              title="No circles yet"
              description="Create a new circle or join one by address above"
              action={
                <Link
                  to="/create"
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-500 transition-colors"
                >
                  Create circle
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {myCircles
                .filter((c) => isCircleFilling(c.account) || isCircleActive(c.account))
                .map((c) => (
                  <Link
                    key={c.address}
                    to={`/circle/${c.address}`}
                    className="block"
                  >
                    <Card className="p-3 hover:border-indigo-700 hover:bg-indigo-950/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CircleStatusBadge status={circleStatusLabel(c.account) as "Filling" | "Active" | "Completed" | "Cancelled"} />
                          <AddressLabel address={c.address} />
                        </div>
                        <span className="text-xs text-slate-500">
                          {c.account.memberCount}/{c.account.maxMembers} members
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Devnet USDC hint */}
      <div className="text-xs text-slate-500 border border-slate-800 rounded-lg p-3 bg-slate-900/50">
        <span className="font-medium text-slate-400">Devnet USDC:</span>{" "}
        Need test tokens?{" "}
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:underline"
        >
          faucet.circle.com
        </a>{" "}
        — use mint{" "}
        <span className="font-mono">4zMMC9…ncDU</span>
      </div>
    </div>
  );
}
