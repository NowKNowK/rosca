import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { explorerTx } from "../lib/constants";
import { parseRoscaError } from "../lib/errors";

export type TxState = "idle" | "building" | "signing" | "confirming" | "success" | "error";

export type SendTxOptions = {
  /** Human-readable action name for toasts */
  action: string;
  /** Query keys to invalidate after success */
  invalidate?: (string | undefined)[][];
  /** Called after success toast to trigger refetch */
  onSuccess?: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxFn = () => Promise<string>; // returns tx signature

export function useSendTx(opts: SendTxOptions) {
  const [state, setState] = useState<TxState>("idle");
  const qc = useQueryClient();

  const send = useCallback(
    async (txFn: TxFn) => {
      if (state !== "idle") return;

      setState("building");
      const toastId = toast.loading(`${opts.action}: building transaction…`);

      try {
        setState("signing");
        toast.loading(`${opts.action}: approve in wallet…`, { id: toastId });

        const sig = await txFn();

        setState("confirming");
        toast.loading(`${opts.action}: confirming…`, { id: toastId });

        // Invalidate queries to refetch fresh state
        for (const key of opts.invalidate ?? []) {
          await qc.invalidateQueries({ queryKey: key.filter(Boolean) });
        }
        await qc.refetchQueries({ type: "active" });

        setState("success");
        toast.success(`${opts.action} confirmed`, {
          id: toastId,
          action: {
            label: "Explorer ↗",
            onClick: () => window.open(explorerTx(sig), "_blank"),
          },
          duration: 8000,
        });

        opts.onSuccess?.();

        // Reset to idle after a beat
        setTimeout(() => setState("idle"), 2000);
      } catch (err: unknown) {
        const msg = parseRoscaError(err);

        if (msg === "WALLET_REJECTED") {
          toast.dismiss(toastId);
          toast("Transaction cancelled", { duration: 2000 });
        } else if (msg === "BLOCKHASH_EXPIRED") {
          toast.error(`${opts.action}: blockhash expired — please retry`, {
            id: toastId,
            duration: 6000,
          });
        } else {
          toast.error(`${opts.action} failed: ${msg}`, {
            id: toastId,
            duration: 8000,
          });
        }

        setState("error");
        setTimeout(() => setState("idle"), 3000);
      }
    },
    [state, opts, qc]
  );

  const isLoading = state !== "idle" && state !== "error";

  return { state, send, isLoading };
}
