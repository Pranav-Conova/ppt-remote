// Phone pairing QR code for the home page. Pairing here, before presenting,
// keeps the code off the projected screen where anyone could scan it.
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Smartphone } from "lucide-react";
import { ensureSession, usePresenterSession } from "../link/presenterSession";
import { StatusBadge } from "../link/StatusBadge";

export function PairCard({ size = 168 }: { size?: number }) {
  const session = usePresenterSession();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void ensureSession();
  }, []);

  const paired = session.status?.peer ?? false;

  const copy = async () => {
    if (!session.pairUrl) return;
    try {
      await navigator.clipboard.writeText(session.pairUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; the link is still selectable below
    }
  };

  if (session.error) return <p className="error small">{session.error}</p>;

  return (
    <div className={`pair-card${paired ? " paired" : ""}`}>
      <div className="pair-visual">
        {paired ? (
          <div className="pair-done" role="status">
            <span className="pair-done-icon">
              <Smartphone size={34} aria-hidden="true" />
              <Check size={16} className="pair-done-check" aria-hidden="true" />
            </span>
            <strong>Phone connected</strong>
          </div>
        ) : session.pairUrl ? (
          <div className="qr pair-qr">
            <QRCodeSVG value={session.pairUrl} size={size} marginSize={1} />
            <span className="pair-scanline" aria-hidden="true" />
          </div>
        ) : (
          <div className="pair-loading muted small">Creating pairing code…</div>
        )}
      </div>
      <StatusBadge status={session.status} waitingFor="phone" />
      {session.unreachable && !paired && (
        <p className="error small">
          Your phone can&apos;t open <strong>localhost</strong>. Use your computer&apos;s network address or an HTTPS
          tunnel, or set PUBLIC_URL on the server.
        </p>
      )}
      {session.pairUrl && !paired && (
        <button className="pair-copy" onClick={copy} title={session.pairUrl}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Link copied" : "Can't scan? Copy link"}
        </button>
      )}
      {session.pairUrl && <input className="pair-url" readOnly value={session.pairUrl} hidden />}
    </div>
  );
}
