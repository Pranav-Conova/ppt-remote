package ws

import (
	"context"
	"encoding/json"
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

func expectClose(t *testing.T, ctx context.Context, c *websocket.Conn, code int) {
	t.Helper()
	_, msg, err := c.Read(ctx)
	if got := websocket.CloseStatus(err); int(got) != code {
		t.Fatalf("expected close %d, got %d (err=%v, msg=%s)", code, got, err, msg)
	}
}

func TestPresenterEndStopsRemote(t *testing.T) {
	hub := session.NewHub(time.Hour, 0)
	srv := httptest.NewServer(&Handler{Hub: hub})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	creds, _ := hub.Create()
	pres := dial(t, ctx, srv, creds, session.Presenter, creds.PresenterToken)
	expectT(t, ctx, pres, "welcome")
	rem := dial(t, ctx, srv, creds, session.Remote, creds.RemoteToken)
	expectT(t, ctx, rem, "welcome")
	expectT(t, ctx, pres, "peer-joined")

	// Closing the presenter tab sends close code 4000.
	pres.Close(session.CodeEnded, "ended")
	expectT(t, ctx, rem, "ended")
	expectClose(t, ctx, rem, session.CodeEnded)

	// The session is gone: reconnecting is refused, so the phone stops retrying.
	again := dial(t, ctx, srv, creds, session.Remote, creds.RemoteToken)
	expectClose(t, ctx, again, session.CodeNotFound)
	if hub.Len() != 0 {
		t.Fatalf("session not deleted")
	}
}

func TestPresenterDropKeepsRemoteWaiting(t *testing.T) {
	hub := session.NewHub(time.Hour, 0)
	srv := httptest.NewServer(&Handler{Hub: hub})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	creds, _ := hub.Create()
	pres := dial(t, ctx, srv, creds, session.Presenter, creds.PresenterToken)
	expectT(t, ctx, pres, "welcome")
	rem := dial(t, ctx, srv, creds, session.Remote, creds.RemoteToken)
	expectT(t, ctx, rem, "welcome")
	expectT(t, ctx, pres, "peer-joined")

	// A dropped connection (no goodbye) is only "peer-left": it may come back.
	pres.CloseNow()
	expectT(t, ctx, rem, "peer-left")
	pres2 := dial(t, ctx, srv, creds, session.Presenter, creds.PresenterToken)
	expectT(t, ctx, pres2, "welcome")
	expectT(t, ctx, rem, "peer-joined")
}

func TestRelayEndToEnd(t *testing.T) {
	hub := session.NewHub(time.Hour, 0)
	srv := httptest.NewServer(&Handler{Hub: hub})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	creds, _ := hub.Create()

	// Wrong token is rejected with a close code the browser can see.
	bad := dial(t, ctx, srv, creds, session.Remote, "bad")
	expectClose(t, ctx, bad, session.CodeUnauthorized)

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
