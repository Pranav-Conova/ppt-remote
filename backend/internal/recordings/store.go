// Package recordings stores motion-sensor recordings uploaded from the Pointer
// Lab page, so the gyro pointer algorithm can be analysed and tuned with real
// device data.
//
// Recordings are JSON files on disk, addressed by an unguessable random ID.
// There is deliberately no listing endpoint: knowing the ID is what grants
// access. On hosts with ephemeral disks (e.g. Render's free tier) files
// disappear on restart, so the Lab page also offers a download.
package recordings

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
)

const MaxBytes = 8 << 20

var (
	ErrInvalid  = errors.New("recording must be a JSON object")
	ErrNotFound = errors.New("recording not found")
	validID     = regexp.MustCompile(`^[A-Za-z0-9_-]{8,32}$`)
)

type Store struct {
	dir string
	max int
	mu  sync.Mutex
}

// New creates the directory if needed. max caps how many recordings are kept;
// the oldest are deleted first.
func New(dir string, max int) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir, max: max}, nil
}

// idAlphabet leaves out look-alike characters (0/o, 1/l/i) because people
// read these IDs off a phone screen and type them.
const idAlphabet = "23456789abcdefghjkmnpqrstuvwxyz"

func newID() string {
	b := make([]byte, 12) // 12 chars × log2(31) ≈ 59 bits
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = idAlphabet[int(b[i])%len(idAlphabet)]
	}
	return string(b)
}

func (s *Store) path(id string) string { return filepath.Join(s.dir, id+".json") }

// Save validates and stores a recording, returning its ID.
func (s *Store) Save(data []byte) (string, error) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(data, &obj); err != nil {
		return "", ErrInvalid
	}
	id := newID()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.WriteFile(s.path(id), data, 0o644); err != nil {
		return "", err
	}
	s.prune()
	return id, nil
}

// Open returns the stored recording; the caller closes it.
func (s *Store) Open(id string) (*os.File, error) {
	if !validID.MatchString(id) {
		return nil, ErrNotFound
	}
	f, err := os.Open(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return f, err
}

func (s *Store) prune() {
	if s.max <= 0 {
		return
	}
	entries, err := os.ReadDir(s.dir)
	if err != nil || len(entries) <= s.max {
		return
	}
	type file struct {
		name string
		mod  int64
	}
	var files []file
	for _, e := range entries {
		if info, err := e.Info(); err == nil && filepath.Ext(e.Name()) == ".json" {
			files = append(files, file{e.Name(), info.ModTime().UnixNano()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod < files[j].mod })
	for _, f := range files[:max(0, len(files)-s.max)] {
		os.Remove(filepath.Join(s.dir, f.name))
	}
}

// Upload handles POST /api/recordings.
func (s *Store) Upload(w http.ResponseWriter, r *http.Request) {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxBytes))
	if err != nil {
		http.Error(w, "recording too large (max 8MB)", http.StatusRequestEntityTooLarge)
		return
	}
	id, err := s.Save(data)
	if errors.Is(err, ErrInvalid) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "could not store recording", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

// Download handles GET /api/recordings/{id}.
func (s *Store) Download(w http.ResponseWriter, r *http.Request) {
	f, err := s.Open(r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "recording not found (it may have been cleared when the server restarted)", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	io.Copy(w, f)
}
