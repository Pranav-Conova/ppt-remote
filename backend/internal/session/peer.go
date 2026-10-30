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
}

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

func (p *Peer) Close() { p.once.Do(func() { close(p.done) }) }
