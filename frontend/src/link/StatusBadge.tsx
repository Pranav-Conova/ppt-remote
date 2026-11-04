import type { LinkStatus } from "./link";

export function StatusBadge({ status, waitingFor }: { status: LinkStatus | null; waitingFor: string }) {
  let tone = "idle";
  let label = "Connecting…";
  let title = "";
  if (status) {
    if (status.ended) {
      tone = "bad";
      label = "Ended";
    } else if (status.server === "offline") {
      tone = "bad";
      label = "Offline, retrying";
      title = "Can't reach the ppt-remote server. It keeps trying by itself.";
    } else if (status.server === "connecting") {
      label = "Connecting…";
    } else if (status.transport === "p2p") {
      tone = "good";
      label = "Connected · fast";
      title = "Phone and laptop talk directly over Wi-Fi, so the pointer has the least lag.";
    } else if (status.transport === "relay") {
      tone = "warn";
      label = "Connected · slower";
      title =
        "Phone and laptop couldn't link directly (different networks, or the Wi-Fi keeps devices apart), so messages go through the server. Everything works, the pointer just lags a little. Joining both to the same hotspot fixes it.";
    } else {
      label = `Waiting for ${waitingFor}`;
    }
  }
  const rtt = status && status.transport !== "none" && status.rtt != null ? `${Math.round(status.rtt)} ms` : null;
  return (
    <span className={`badge badge-${tone}`} title={title || undefined}>
      <span className="badge-dot" />
      {label}
      {rtt && <span className="badge-rtt">{rtt}</span>}
    </span>
  );
}
