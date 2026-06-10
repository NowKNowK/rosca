type CircleStatus = "Filling" | "Active" | "Completed" | "Cancelled";
type MemberStatus = "Active" | "Exited" | "Defaulted" | "Completed";

const circleColors: Record<CircleStatus, string> = {
  Filling: "bg-sky-900/40 text-sky-300 border-sky-700",
  Active: "bg-emerald-900/40 text-emerald-400 border-emerald-700",
  Completed: "bg-slate-800 text-slate-400 border-slate-600",
  Cancelled: "bg-red-900/40 text-red-400 border-red-700",
};

const memberColors: Record<MemberStatus, string> = {
  Active: "bg-emerald-900/40 text-emerald-400 border-emerald-700",
  Exited: "bg-amber-900/40 text-amber-400 border-amber-700",
  Defaulted: "bg-red-900/40 text-red-400 border-red-700",
  Completed: "bg-sky-900/40 text-sky-300 border-sky-700",
};

export function CircleStatusBadge({ status }: { status: CircleStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${circleColors[status]}`}>
      {status}
    </span>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${memberColors[status]}`}>
      {status}
    </span>
  );
}
