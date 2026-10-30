package session

import (
	"sync"
	"sync/atomic"
)

// ctrlQueueSize bounds buffered control/signaling messages per peer. A peer
// that falls this far behind is considered dead and gets disconnected.
const ctrlQueueSize = 64

// Peer is the outbound side of one connected client. Text messages
// (signaling + relayed control) are queued in order; binary pointer frames
// are coalesced so a slow reader only ever receives the newest position and
// never builds up a backlog.
type Peer struct {
	ctrl    chan []byte
	pointer atomic.Pointer[[]byte]
	wake    chan struct{}
	done    chan struct{}
	once    sync.Once
	reason  CloseReason
}

// CloseReason is the WebSocket close code and text sent when a peer is closed.
type CloseReason struct {
	Code int
	Text string
}

// Close codes the browser client acts on (4000-4999 are application-defined).
const (
	// CodeEnded: the presenter ended the session; the remote should stop.
	CodeEnded = 4000
	// CodeNotFound: the session does not exist (any more).
	CodeNotFound = 4404
	// CodeUnauthorized: the token does not match.
	CodeUnauthorized = 4401
	// CodeReplaced: another connection took over this role, or the peer was too slow.
	CodeReplaced = 1008
)

func NewPeer() *Peer {
	return &Peer{
		ctrl: make(chan []byte, ctrlQueueSize),
		wake: make(chan struct{}, 1),
		done: make(chan struct{}),
	}
}

// SendText queues a text frame. It returns false (and closes the peer) if the
// queue is full.
func (p *Peer) SendText(msg []byte) bool {
	select {
	case <-p.done:
		return false
	default:
	}
	select {
	case p.ctrl <- msg:
		return true
	default:
		p.Close()
		return false
	}
}

// SendPointer replaces any unsent pointer frame with msg.
func (p *Peer) SendPointer(msg []byte) {
	p.pointer.Store(&msg)
	select {
	case p.wake <- struct{}{}:
	default:
	}
}

// Text returns the queue of pending text frames.
func (p *Peer) Text() <-chan []byte { return p.ctrl }

// Wake fires when a pointer frame may be pending; call TakePointer.
func (p *Peer) Wake() <-chan struct{} { return p.wake }

// TakePointer returns the latest pending pointer frame, or nil.
func (p *Peer) TakePointer() []byte {
	if m := p.pointer.Swap(nil); m != nil {
		return *m
	}
	return nil
}

// Done is closed once the peer has been closed.
func (p *Peer) Done() <-chan struct{} { return p.done }

// Close closes the peer as replaced or too slow.
func (p *Peer) Close() { p.CloseWith(CodeReplaced, "replaced or too slow") }

// CloseWith closes the peer; the connection is closed with code and text.
func (p *Peer) CloseWith(code int, text string) {
	p.once.Do(func() {
		p.reason = CloseReason{code, text}
		close(p.done)
	})
}

// Reason is valid once Done is closed.
func (p *Peer) Reason() CloseReason { return p.reason }
