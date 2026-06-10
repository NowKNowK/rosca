// Maps RoscaError codes (6000-6023) from programs/rosca/src/errors.rs to user-readable messages.
const ERROR_MAP: Record<number, string> = {
  6000: "Invalid circle configuration — check contribution amount, duration, and member limits.",
  6001: "This circle is no longer accepting members.",
  6002: "This circle is full — no positions available.",
  6003: "The start deadline has passed — you can no longer join.",
  6004: "The start deadline has not passed yet.",
  6005: "This circle requires a clean history, but your wallet has defaults.",
  6006: "This circle is not active yet.",
  6007: "Your membership is not in Active state.",
  6008: "You have already contributed in this round.",
  6009: "Invalid round number.",
  6010: "This round has not started yet.",
  6011: "The contribution window for this round has closed — you can now be slashed.",
  6012: "This round's payout has already been claimed.",
  6013: "Too early to claim: the pot isn't full and the round window hasn't closed yet.",
  6014: "Recipient does not match the scheduled position for this round.",
  6015: "Recipient has missed a contribution and is not eligible to claim this round.",
  6016: "This member contributed in the specified round and cannot be slashed.",
  6017: "Grace period has not expired — slash not allowed yet.",
  6018: "This member has already received their payout.",
  6019: "Your payout round has arrived — use Claim Payout instead of exiting.",
  6020: "Exit window is closed: fewer than 2 rounds remain in the circle.",
  6021: "Circle is not in Completed or Cancelled state.",
  6022: "Some member accounts are still open — close them before closing the circle.",
  6023: "Arithmetic overflow — this is a bug, please report it.",
};

export function parseRoscaError(err: unknown): string {
  if (err instanceof Error) {
    // AnchorError with errorCode
    const anchorErr = err as { errorCode?: { number?: number }; logs?: string[] };
    if (anchorErr.errorCode?.number !== undefined) {
      const msg = ERROR_MAP[anchorErr.errorCode.number];
      if (msg) return msg;
    }
    // Try to parse from logs
    const logsStr = anchorErr.logs?.join("\n") ?? "";
    const match = logsStr.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const code = parseInt(match[1], 16);
      const msg = ERROR_MAP[code];
      if (msg) return msg;
    }
    // Wallet rejection
    if (err.message.includes("User rejected") || err.message.includes("4001")) {
      return "WALLET_REJECTED";
    }
    // Blockhash / timeout
    if (err.message.includes("blockhash") || err.message.includes("expired")) {
      return "BLOCKHASH_EXPIRED";
    }
    // Insufficient funds
    if (err.message.includes("insufficient lamports") || err.message.includes("0x1")) {
      return "Insufficient SOL balance to pay for this transaction.";
    }
    return err.message;
  }
  return String(err);
}
