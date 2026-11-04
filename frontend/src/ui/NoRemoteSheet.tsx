import { Smartphone, X } from "lucide-react";
import { Sheet } from "./Sheet";

/**
 * Start was pressed before a phone was paired. Pairing is the expected path,
 * so "Pair my phone" is the main button; going on without one is still allowed.
 */
export function NoRemoteSheet({ onPair, onContinue }: { onPair: () => void; onContinue: () => void }) {
  return (
    <Sheet labelledBy="no-remote-title" className="no-remote-sheet" onClose={onPair}>
      {(close) => (
        <>
          <header className="sheet-head">
            <span className="no-remote-icon" aria-hidden="true">
              <Smartphone size={22} />
            </span>
            <button className="sheet-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
          </header>
          <div>
            <h2 id="no-remote-title">Continue without a remote?</h2>
            <p className="muted small">
              Your phone isn't paired yet. You can also connect it from the presentation page: press <kbd>P</kbd> or
              click <strong>Pair phone</strong> in the toolbar.
            </p>
          </div>
          <footer className="no-remote-actions">
            <button className="btn-quiet-pill" onClick={onContinue}>
              Continue without remote
            </button>
            <button className="btn-pair-pill" onClick={close}>
              Pair my phone
            </button>
          </footer>
        </>
      )}
    </Sheet>
  );
}
