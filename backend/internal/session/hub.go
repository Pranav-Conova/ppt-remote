// Package session pairs a presenter (laptop) with a remote (phone) and relays
// messages between them.
package session

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

type Role string

const (
	Presenter Role = "presenter"
	Remote    Role = "remote"
)

func (r Role) Valid() bool { return r == Presenter || r == Remote }

func (r Role) Other() Role {
	if r == Presenter {
		return Remote
	}
	return Presenter
}

var (
	ErrNotFound     = errors.New("session not found")
	ErrUnauthorized = errors.New("invalid token")
	ErrFull         = errors.New("too many sessions")
)

// Credentials are handed to the presenter when a session is created. The
// remote token is embedded in the QR code.
type Credentials struct {
	ID             string `json:"id"`
	PresenterToken string `json:"presenterToken"`
	RemoteToken    string `json:"remoteToken"`
}

type Session struct {
	ID     string
	tokens map[Role]string

	mu      sync.Mutex
	peers   map[Role]*Peer
	expires time.Time
	ended   bool
	// grace ends the session if the presenter stays away too long.
	grace *time.Timer
}

type Hub struct {
	TTL         time.Duration
	MaxSessions int
	// PresenterGrace is how long a session survives after the presenter
	// disconnects without ending it (crash, network loss). 0 = until TTL.
	PresenterGrace time.Duration
	Now            func() time.Time

	mu       sync.Mutex
	sessions map[string]*Session
}

func NewHub(ttl time.Duration, maxSessions int) *Hub {
	return &Hub{
		TTL:            ttl,
		MaxSessions:    maxSessions,
		PresenterGrace: 90 * time.Second,
		Now:            time.Now,
		sessions:       make(map[string]*Session),
	}
}

func randomToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (h *Hub) Create() (Credentials, error) {
	c := Credentials{ID: randomToken(), PresenterToken: randomToken(), RemoteToken: randomToken()}
	s := &Session{
		ID:      c.ID,
		tokens:  map[Role]string{Presenter: c.PresenterToken, Remote: c.RemoteToken},
		peers:   make(map[Role]*Peer),
		expires: h.Now().Add(h.TTL),
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if h.MaxSessions > 0 && len(h.sessions) >= h.MaxSessions {
		return Credentials{}, ErrFull
	}
	h.sessions[c.ID] = s
	return c, nil
}

// Authenticate returns the session if token matches the token issued for role.
func (h *Hub) Authenticate(id string, role Role, token string) (*Session, error) {
	h.mu.Lock()
	s, ok := h.sessions[id]
	h.mu.Unlock()
	if !ok {
		return nil, ErrNotFound
	}
	if !role.Valid() || subtle.ConstantTimeCompare([]byte(s.tokens[role]), []byte(token)) != 1 {
		return nil, ErrUnauthorized
	}
	return s, nil
}

// Sweep removes expired sessions that have nobody connected.
func (h *Hub) Sweep() {
	now := h.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, s := range h.sessions {
		s.mu.Lock()
		dead := len(s.peers) == 0 && now.After(s.expires)
		s.mu.Unlock()
		if dead {
			delete(h.sessions, id)
		}
	}
}

func (h *Hub) Len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.sessions)
}

// Attach registers p as the connection for role, replacing (and closing) any
// previous connection for that role. It tells p whether the other side is
// already present and notifies the other side that p joined.
func (h *Hub) Attach(s *Session, role Role, p *Peer) {
	s.mu.Lock()
	if s.ended {
		s.mu.Unlock()
		p.CloseWith(CodeNotFound, "session ended")
		return
	}
	if role == Presenter && s.grace != nil {
		s.grace.Stop()
		s.grace = nil
	}
	old := s.peers[role]
	s.peers[role] = p
	other := s.peers[role.Other()]
	s.expires = h.Now().Add(h.TTL)
	s.mu.Unlock()

	if old != nil {
		old.Close()
	}
	if other != nil {
		p.SendText([]byte(`{"t":"welcome","peer":true}`))
		other.SendText([]byte(`{"t":"peer-joined"}`))
	} else {
		p.SendText([]byte(`{"t":"welcome","peer":false}`))
	}
}

// Detach removes p if it is still the active connection for role.
func (h *Hub) Detach(s *Session, role Role, p *Peer) {
	s.mu.Lock()
	if s.peers[role] != p {
		s.mu.Unlock()
		return
	}
	delete(s.peers, role)
	other := s.peers[role.Other()]
	s.expires = h.Now().Add(h.TTL)
	if role == Presenter && h.PresenterGrace > 0 {
		if s.grace != nil {
			s.grace.Stop()
		}
		s.grace = time.AfterFunc(h.PresenterGrace, func() { h.endIfPresenterAway(s) })
	}
	s.mu.Unlock()

	if other != nil {
		other.SendText([]byte(`{"t":"peer-left"}`))
	}
}

// End finishes the session for good: the remote is told and disconnected
// with CodeEnded, and later connection attempts get CodeNotFound.
func (h *Hub) End(s *Session) {
	h.mu.Lock()
	delete(h.sessions, s.ID)
	h.mu.Unlock()

	s.mu.Lock()
	if s.ended {
		s.mu.Unlock()
		return
	}
	s.ended = true
	if s.grace != nil {
		s.grace.Stop()
		s.grace = nil
	}
	peers := s.peers
	s.peers = make(map[Role]*Peer)
	s.mu.Unlock()

	for role, p := range peers {
		if role == Remote {
			p.SendText([]byte(`{"t":"ended"}`))
		}
		p.CloseWith(CodeEnded, "presentation ended")
	}
}

func (h *Hub) endIfPresenterAway(s *Session) {
	s.mu.Lock()
	away := s.peers[Presenter] == nil && !s.ended
	s.mu.Unlock()
	if away {
		h.End(s)
	}
}

func (s *Session) other(role Role) *Peer {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.peers[role.Other()]
}

// ForwardText delivers a signaling/control message to the other side.
func (s *Session) ForwardText(from Role, msg []byte) {
	if p := s.other(from); p != nil {
		p.SendText(msg)
	}
}

// ForwardPointer delivers a pointer frame to the other side, latest-wins.
func (s *Session) ForwardPointer(from Role, msg []byte) {
	if p := s.other(from); p != nil {
		p.SendPointer(msg)
	}
}
