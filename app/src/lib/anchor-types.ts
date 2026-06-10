// Helpers to convert Anchor's BN to bigint at the hook boundary.
// All lib/rosca.ts logic uses bigint; BN only appears in Anchor fetch results.
import type BN from "bn.js";

export function bn(x: BN | bigint | number): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return BigInt(x);
  return BigInt(x.toString());
}

export function bnArr(xs: (BN | bigint | number)[]): bigint[] {
  return xs.map(bn);
}
