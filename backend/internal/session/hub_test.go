package session

import (
	"errors"
	"testing"
	"time"
)

func TestAuthenticate(t *testing.T) {
	h := NewHub(time.Hour, 0)
	c, err := h.Create()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Authenticate(c.ID, Presenter, c.PresenterToken); err != nil {
		t.Fatalf("presenter token rejected: %v", err)
	}
	if _, err := h.Authenticate(c.ID, Remote, c.RemoteToken); err != nil {
		t.Fatalf("remote token rejected: %v", err)
	}
	if _, err := h.Authenticate(c.ID, Remote, c.PresenterToken); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("presenter token accepted for remote role: %v", err)
	}
	if _, err := h.Authenticate(c.ID, "admin", c.PresenterToken); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("invalid role accepted: %v", err)
	}
	if _, err := h.Authenticate("nope", Presenter, c.PresenterToken); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown session: %v", err)
	}
}

func TestMaxSessions(t *testing.T) {
	h := NewHub(time.Hour, 1)
	if _, err := h.Create(); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Create(); !errors.Is(err, ErrFull) {
		t.Fatalf("expected ErrFull, got %v", err)
	}
}

func TestSweepExpiresOnlyIdleSessions(t *testing.T) {
	now := time.Unix(0, 0)
	h := NewHub(time.Minute, 0)
	h.Now = func() time.Time { return now }

	idle, _ := h.Create()
	busy, _ := h.Create()
	s, _ := h.Authenticate(busy.ID, Presenter, busy.PresenterToken)
	h.Attach(s, Presenter, NewPeer())

	now = now.Add(2 * time.Minute)
	h.Sweep()

	if _, err := h.Authenticate(idle.ID, Presenter, idle.PresenterToken); !errors.Is(err, ErrNotFound) {
		t.Fatalf("idle session should be swept, got %v", err)
	}
	if _, err := h.Authenticate(busy.ID, Presenter, busy.PresenterToken); err != nil {
		t.Fatalf("connected session should survive: %v", err)
	}
}

func recv(t *testing.T, p *Peer) string {
	t.Helper()
	select {
	case m := <-p.Text():
		return string(m)
	case <-time.After(time.Second):
		t.Fatal("no message")
		return ""
	}
}

func TestPairingAndForwarding(t *testing.T) {
	h := NewHub(time.Hour, 0)
	c, _ := h.Create()
	s, _ := h.Authenticate(c.ID, Presenter, c.PresenterToken)

	pres, rem := NewPeer(), NewPeer()
	h.Attach(s, Presenter, pres)
	if got := recv(t, pres); got != `{"t":"welcome","peer":false}` {
		t.Fatalf("presenter welcome: %s", got)
	}
	h.Attach(s, Remote, rem)
	if got := recv(t, rem); got != `{"t":"welcome","peer":true}` {
		t.Fatalf("remote welcome: %s", got)
	}
	if got := recv(t, pres); got != `{"t":"peer-joined"}` {
		t.Fatalf("presenter notify: %s", got)
	}

	s.ForwardText(Remote, []byte(`{"t":"ctrl"}`))
	if got := recv(t, pres); got != `{"t":"ctrl"}` {
		t.Fatalf("forward: %s", got)
	}

	// A second phone replaces the first one, which gets closed.
	rem2 := NewPeer()
	h.Attach(s, Remote, rem2)
	select {
	case <-rem.Done():
	default:
		t.Fatal("replaced remote was not closed")
	}
	recv(t, pres) // peer-joined for rem2

	// Detaching the stale peer must not evict the new one.
	h.Detach(s, Remote, rem)
	s.ForwardText(Presenter, []byte(`x`))
	if got := recv(t, rem2); got != `{"t":"welcome","peer":true}` {
		t.Fatalf("rem2 welcome: %s", got)
	}
	if got := recv(t, rem2); got != `x` {
		t.Fatalf("rem2 should still receive: %s", got)
	}

	h.Detach(s, Remote, rem2)
	if got := recv(t, pres); got != `{"t":"peer-left"}` {
		t.Fatalf("peer-left: %s", got)
	}
}

func TestPointerCoalescing(t *testing.T) {
	p := NewPeer()
	for i := 0; i < 100; i++ {
		p.SendPointer([]byte{byte(i)})
	}
	<-p.Wake()
	got := p.TakePointer()
	if len(got) != 1 || got[0] != 99 {
		t.Fatalf("expected only the latest frame (99), got %v", got)
	}
	if p.TakePointer() != nil {
		t.Fatal("expected no backlog after taking the latest frame")
	}
}

func TestSlowPeerIsClosedWhenQueueFull(t *testing.T) {
	p := NewPeer()
	for i := 0; i < ctrlQueueSize; i++ {
		if !p.SendText([]byte("m")) {
			t.Fatalf("send %d failed early", i)
		}
	}
	if p.SendText([]byte("overflow")) {
		t.Fatal("overflow send should fail")
	}
	select {
	case <-p.Done():
	default:
		t.Fatal("peer should be closed after overflow")
	}
}

func TestEndNotifiesRemoteAndDeletesSession(t *testing.T) {
	h := NewHub(time.Hour, 0)
	c, _ := h.Create()
	s, _ := h.Authenticate(c.ID, Presenter, c.PresenterToken)
	pres, rem := NewPeer(), NewPeer()
	h.Attach(s, Presenter, pres)
	h.Attach(s, Remote, rem)
	recv(t, rem) // welcome

	h.End(s)
	if got := recv(t, rem); got != `{"t":"ended"}` {
		t.Fatalf("remote should be told: %s", got)
	}
	<-rem.Done()
	if r := rem.Reason(); r.Code != CodeEnded {
		t.Fatalf("remote close code %d", r.Code)
	}
	if _, err := h.Authenticate(c.ID, Remote, c.RemoteToken); err != ErrNotFound {
		t.Fatalf("session should be gone, got %v", err)
	}
	// A connection that authenticated just before End is turned away.
	late := NewPeer()
	h.Attach(s, Remote, late)
	<-late.Done()
	if late.Reason().Code != CodeNotFound {
		t.Fatalf("late attach code %d", late.Reason().Code)
	}
}

func TestPresenterGrace(t *testing.T) {
	h := NewHub(time.Hour, 0)
	h.PresenterGrace = 30 * time.Millisecond

	// Presenter comes back in time: the session survives.
	c, _ := h.Create()
	s, _ := h.Authenticate(c.ID, Presenter, c.PresenterToken)
	p1 := NewPeer()
	h.Attach(s, Presenter, p1)
	h.Detach(s, Presenter, p1)
	h.Attach(s, Presenter, NewPeer())
	time.Sleep(80 * time.Millisecond)
	if h.Len() != 1 {
		t.Fatal("session ended although the presenter returned")
	}

	// Presenter stays away: the session ends and the remote is closed.
	c2, _ := h.Create()
	s2, _ := h.Authenticate(c2.ID, Presenter, c2.PresenterToken)
	p2, rem := NewPeer(), NewPeer()
	h.Attach(s2, Presenter, p2)
	h.Attach(s2, Remote, rem)
	h.Detach(s2, Presenter, p2)
	select {
	case <-rem.Done():
	case <-time.After(time.Second):
		t.Fatal("remote not closed after the grace period")
	}
	if rem.Reason().Code != CodeEnded || h.Len() != 1 {
		t.Fatalf("code %d, sessions %d", rem.Reason().Code, h.Len())
	}
}
