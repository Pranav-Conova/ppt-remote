// Package ws exposes the signaling / fallback-relay WebSocket endpoint.
package ws

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"github.com/Pranav-Conova/Signify/backend/internal/session"
)

const (
	readLimit    = 64 << 10
	writeTimeout = 5 * time.Second
	pingInterval = 20 * time.Second
)

type Handler struct {
	Hub *session.Hub
	// OriginPatterns lists extra allowed Origin hosts (path.Match syntax).
	// Same-origin requests are always allowed.
	OriginPatterns []string
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	role := session.Role(q.Get("role"))
	s, err := h.Hub.Authenticate(q.Get("session"), role, q.Get("token"))
	switch {
	case errors.Is(err, session.ErrNotFound):
		http.Error(w, "session not found", http.StatusNotFound)
		return
	case err != nil:
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.OriginPatterns})
	if err != nil {
		return
	}
	conn.SetReadLimit(readLimit)

	peer := session.NewPeer()
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go func() {
		writeLoop(ctx, conn, peer)
		cancel()
	}()

	h.Hub.Attach(s, role, peer)
	defer h.Hub.Detach(s, role, peer)
	defer peer.Close()

	for {
		typ, msg, err := conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) == -1 && ctx.Err() == nil {
				slog.Debug("ws read", "err", err)
			}
			conn.CloseNow()
			return
		}
		if typ == websocket.MessageBinary {
			s.ForwardPointer(role, msg)
		} else {
			s.ForwardText(role, msg)
		}
	}
}

// writeLoop is the only goroutine writing to conn. Pointer frames are taken
// from a latest-value slot, so they never queue behind each other.
func writeLoop(ctx context.Context, conn *websocket.Conn, p *session.Peer) {
	ping := time.NewTicker(pingInterval)
	defer ping.Stop()

	write := func(typ websocket.MessageType, msg []byte) bool {
		wctx, cancel := context.WithTimeout(ctx, writeTimeout)
		defer cancel()
		return conn.Write(wctx, typ, msg) == nil
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-p.Done():
			conn.Close(websocket.StatusPolicyViolation, "replaced or too slow")
			return
		case msg := <-p.Text():
			if !write(websocket.MessageText, msg) {
				return
			}
		case <-p.Wake():
			if msg := p.TakePointer(); msg != nil && !write(websocket.MessageBinary, msg) {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
