package recordings

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestUploadAndDownload(t *testing.T) {
	s, err := New(t.TempDir(), 10)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/recordings", s.Upload)
	mux.HandleFunc("GET /api/recordings/{id}", s.Download)

	body := `{"version":1,"motion":{"t":[0,16]}}`
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/recordings", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var out struct{ ID string }
	json.Unmarshal(rec.Body.Bytes(), &out)
	if !validID.MatchString(out.ID) {
		t.Fatalf("bad id %q", out.ID)
	}

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/recordings/"+out.ID, nil))
	if rec.Code != http.StatusOK || rec.Body.String() != body {
		t.Fatalf("download: %d %q", rec.Code, rec.Body)
	}
}

func TestRejectsNonObjectAndBadIDs(t *testing.T) {
	s, _ := New(t.TempDir(), 10)
	for _, body := range []string{"", "[1,2]", "not json", `"str"`} {
		rec := httptest.NewRecorder()
		s.Upload(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %q: expected 400, got %d", body, rec.Code)
		}
	}
	for _, id := range []string{"../secret", "..", "a/b", "short", strings.Repeat("x", 40)} {
		if _, err := s.Open(id); err != ErrNotFound {
			t.Errorf("id %q should be rejected, got %v", id, err)
		}
	}
}

func TestRejectsOversizedUpload(t *testing.T) {
	s, _ := New(t.TempDir(), 10)
	big := bytes.Repeat([]byte("a"), MaxBytes+1)
	rec := httptest.NewRecorder()
	s.Upload(rec, httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(big)))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", rec.Code)
	}
}

func TestPrunesOldest(t *testing.T) {
	dir := t.TempDir()
	s, _ := New(dir, 2)
	var ids []string
	for i := 0; i < 3; i++ {
		id, err := s.Save([]byte(`{}`))
		if err != nil {
			t.Fatal(err)
		}
		// Make modification times strictly ordered.
		os.Chtimes(s.path(id), time.Now(), time.Now().Add(time.Duration(i)*time.Second))
		ids = append(ids, id)
	}
	s.mu.Lock()
	s.prune()
	s.mu.Unlock()
	if _, err := s.Open(ids[0]); err != ErrNotFound {
		t.Fatal("oldest recording should have been pruned")
	}
	for _, id := range ids[1:] {
		f, err := s.Open(id)
		if err != nil {
			t.Fatalf("recording %s missing: %v", id, err)
		}
		io.Copy(io.Discard, f)
		f.Close()
	}
}
