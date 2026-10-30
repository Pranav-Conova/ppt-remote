package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Pranav-Conova/Signify/backend/internal/session"
)

func dial(t *testing.T, ctx context.Context, srv *httptest.Server, c session.Credentials, role session.Role, token string) *websocket.Conn {
	t.Helper()
	q := url.Values{"session": {c.ID}, "role": {string(role)}, "token": {token}}
	u := "ws" + strings.TrimPrefix(srv.URL, "http") + "/?" + q.Encode()
	conn, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", role, err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	return conn
}

func readType(t *testing.T, ctx context.Context, c *websocket.Conn) (websocket.MessageType, []byte) {
	t.Helper()
	typ, msg, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	return typ, msg
}

func expectT(t *testing.T, ctx context.Context, c *websocket.Conn, want string) {
	t.Helper()
	_, msg := readType(t, ctx, c)
	var m struct{ T string }
	json.Unmarshal(msg, &m)
	if m.T != want {
		t.Fatalf("expected %q, got %s", want, msg)
	}
}

func TestRelayEndToEnd(t *testing.T) {
	hub := session.NewHub(time.Hour, 0)
	srv := httptest.NewServer(&Handler{Hub: hub})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	creds, _ := hub.Create()

	// Wrong token is rejected before upgrade.
	q := url.Values{"session": {creds.ID}, "role": {"remote"}, "token": {"bad"}}
	if _, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/?"+q.Encode(), nil); err == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got err=%v", err)
	}

	pres := dial(t, ctx, srv, creds, session.Presenter, creds.PresenterToken)
	expectT(t, ctx, pres, "welcome")
	rem := dial(t, ctx, srv, creds, session.Remote, creds.RemoteToken)
	expectT(t, ctx, rem, "welcome")
	expectT(t, ctx, pres, "peer-joined")

	// Text goes through in order.
	rem.Write(ctx, websocket.MessageText, []byte(`{"t":"ctrl","a":"next"}`))
	_, msg := readType(t, ctx, pres)
	if string(msg) != `{"t":"ctrl","a":"next"}` {
		t.Fatalf("got %s", msg)
	}

	// Binary pointer frames arrive as binary.
	rem.Write(ctx, websocket.MessageBinary, []byte{1, 2, 3, 4, 5, 6, 7, 8})
	typ, msg := readType(t, ctx, pres)
	if typ != websocket.MessageBinary || len(msg) != 8 {
		t.Fatalf("pointer frame: %v %v", typ, msg)
	}

	rem.Close(websocket.StatusNormalClosure, "")
	expectT(t, ctx, pres, "peer-left")
}
