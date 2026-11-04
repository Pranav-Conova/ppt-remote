// Command server is the ppt-remote backend: it serves the web app, pairs phones
// with presenters over QR codes, relays WebRTC signaling (and acts as a
// fallback data relay), and converts PPTX to PDF.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Pranav-Conova/Signify/backend/internal/convert"
	"github.com/Pranav-Conova/Signify/backend/internal/recordings"
	"github.com/Pranav-Conova/Signify/backend/internal/session"
	"github.com/Pranav-Conova/Signify/backend/internal/web"
	"github.com/Pranav-Conova/Signify/backend/internal/ws"
)

const defaultICEServers = `[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]`

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func main() {
	port := env("PORT", "8080")
	// Base URL phones should open, e.g. a tunnel URL in development. Empty means
	// "whatever origin the presenter is using".
	publicURL := strings.TrimRight(os.Getenv("PUBLIC_URL"), "/")
	iceServers := json.RawMessage(env("ICE_SERVERS", defaultICEServers))
	if !json.Valid(iceServers) {
		slog.Error("ICE_SERVERS is not valid JSON")
		os.Exit(1)
	}
	var origins []string
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}

	hub := session.NewHub(4*time.Hour, 10000)
	conv := convert.New(os.Getenv("SOFFICE_PATH"), 1, 120*time.Second)
	slog.Info("pptx conversion", "available", conv.Available())
	recDir := env("RECORDINGS_DIR", filepath.Join(os.TempDir(), "ppt-remote-recordings"))
	recs, err := recordings.New(recDir, 500)
	if err != nil {
		slog.Error("recordings dir", "dir", recDir, "err", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"iceServers": iceServers,
			"convert":    conv.Available(),
			"publicUrl":  publicURL,
		})
	})
	mux.HandleFunc("POST /api/sessions", func(w http.ResponseWriter, r *http.Request) {
		creds, err := hub.Create()
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, creds)
	})
	mux.Handle("POST /api/convert", conv)
	mux.HandleFunc("POST /api/recordings", recs.Upload)
	mux.HandleFunc("GET /api/recordings/{id}", recs.Download)
	mux.Handle("GET /ws/signal", &ws.Handler{Hub: hub, OriginPatterns: origins})
	mux.Handle("/", web.Handler())

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				hub.Sweep()
			}
		}
	}()

	go func() {
		slog.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
