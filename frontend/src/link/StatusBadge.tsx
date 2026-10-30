import type { LinkStatus } from "./link";

export function StatusBadge({ status, waitingFor }: { status: LinkStatus | null; waitingFor: string }) {
  let tone = "idle";
  let label = "Connecting…";
  if (status) {
    if (status.server === "offline") {
      tone = "bad";
      label = "Server offline, retrying";
    } else if (status.server === "connecting") {
      label = "Connecting…";
    } else if (status.transport === "p2p") {
      tone = "good";
      label = "Direct";
    } else if (status.transport === "relay") {
      tone = "warn";
      label = "Via server";
    } else {
      label = `Waiting for ${waitingFor}`;
    }
  }
  const rtt = status && status.transport !== "none" && status.rtt != null ? ` · ${Math.round(status.rtt)} ms` : "";
  return (
    <span
      className={`badge badge-${tone}`}
      title="Direct = phone and laptop talk over Wi-Fi (lowest latency). Via server = relayed through the internet."
    >
      <span className="badge-dot" />
      {label}
      {rtt}
    </span>
  );
}
