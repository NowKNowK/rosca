import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";

export function circlePda(creator: PublicKey, circleId: bigint): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(circleId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), creator.toBuffer(), buf],
    PROGRAM_ID
  );
  return pda;
}

export function memberPda(circle: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function historyPda(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("history"), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function vaultAta(circle: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, circle, true);
}
