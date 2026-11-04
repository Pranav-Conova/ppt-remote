// Package convert turns PowerPoint files into PDF using headless LibreOffice.
// PDFs never hit the server: the browser renders them directly.
package convert

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const MaxUploadBytes = 50 << 20

var allowedExt = map[string]bool{".ppt": true, ".pptx": true, ".odp": true}

type Converter struct {
	soffice string
	timeout time.Duration
	sem     chan struct{}
}

// New locates soffice. path may be empty to search the usual names/locations.
func New(path string, concurrency int, timeout time.Duration) *Converter {
	if concurrency < 1 {
		concurrency = 1
	}
	return &Converter{soffice: findSoffice(path), timeout: timeout, sem: make(chan struct{}, concurrency)}
}

func findSoffice(path string) string {
	candidates := []string{path, "soffice", "libreoffice",
		`C:\Program Files\LibreOffice\program\soffice.exe`,
		"/Applications/LibreOffice.app/Contents/MacOS/soffice"}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p
		}
	}
	return ""
}

func (c *Converter) Available() bool { return c.soffice != "" }

func (c *Converter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !c.Available() {
		http.Error(w, "PPTX conversion is not available on this server (LibreOffice not installed). Export your slides to PDF instead.", http.StatusNotImplemented)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxUploadBytes)
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "expected multipart field 'file' (max 50MB)", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExt[ext] {
		http.Error(w, "unsupported file type; upload .ppt, .pptx or .odp", http.StatusUnsupportedMediaType)
		return
	}

	select {
	case c.sem <- struct{}{}:
		defer func() { <-c.sem }()
	case <-r.Context().Done():
		return
	}

	dir, err := os.MkdirTemp("", "ppt-remote-convert-")
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(dir)

	in := filepath.Join(dir, "slides"+ext)
	if err := saveTo(in, file); err != nil {
		http.Error(w, "upload failed", http.StatusBadRequest)
		return
	}

	pdf, err := c.convert(r.Context(), dir, in)
	if err != nil {
		slog.Error("pptx conversion failed", "err", err)
		http.Error(w, "conversion failed", http.StatusUnprocessableEntity)
		return
	}
	f, err := os.Open(pdf)
	if err != nil {
		http.Error(w, "conversion failed", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Cache-Control", "no-store")
	io.Copy(w, f)
}

func saveTo(path string, src io.Reader) error {
	dst, err := os.Create(path)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		return err
	}
	return dst.Close()
}

func (c *Converter) convert(ctx context.Context, dir, in string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	// A private profile dir lets several conversions run without fighting
	// over LibreOffice's user-profile lock.
	profilePath := filepath.ToSlash(filepath.Join(dir, "profile"))
	if !strings.HasPrefix(profilePath, "/") {
		profilePath = "/" + profilePath // Windows drive paths: file:///C:/...
	}
	profile := (&url.URL{Scheme: "file", Path: profilePath}).String()
	cmd := exec.CommandContext(ctx, c.soffice,
		"-env:UserInstallation="+profile,
		"--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, in)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", errors.Join(err, errors.New(strings.TrimSpace(string(out))))
	}
	pdf := strings.TrimSuffix(in, filepath.Ext(in)) + ".pdf"
	if _, err := os.Stat(pdf); err != nil {
		return "", errors.Join(err, errors.New(strings.TrimSpace(string(out))))
	}
	return pdf, nil
}
