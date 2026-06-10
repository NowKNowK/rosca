import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import type { Rosca } from "../idl/rosca";
import idl from "../idl/rosca.json";

type ProgramCtx = Program<Rosca>;

const ProgramContext = createContext<ProgramCtx | null>(null);

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    const anchorWallet = wallet.publicKey
      ? {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction!,
          signAllTransactions: wallet.signAllTransactions!,
        }
      : {
          publicKey: Keypair.generate().publicKey,
          signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
          signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
        };

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });

    return new Program(idl as Idl, provider) as unknown as ProgramCtx;
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return (
    <ProgramContext.Provider value={program}>
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram(): ProgramCtx {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error("useProgram must be used inside ProgramProvider");
  return ctx;
}
