import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj"
);

export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const DEVNET_USDC_DECIMALS = 6;

export const DEMO_CIRCLE_ADDRESS = "8vDKkWNdaikiy3ihuAhnKfTmHUhUZijpehcZCYXvQuHh";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function explorerAddress(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
}

export const KNOWN_CIRCLES_KEY = "rosca:knownCircles";
