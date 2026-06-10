import { explorerAddress } from "../../lib/constants";
import { short } from "../../lib/format";

export function AddressLabel({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono text-xs text-slate-400 hover:text-indigo-400 transition-colors ${className}`}
      title={address}
    >
      {short(address)}
    </a>
  );
}
