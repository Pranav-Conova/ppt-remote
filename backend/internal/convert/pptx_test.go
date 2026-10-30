package convert

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestUnavailableReturns501(t *testing.T) {
	c := &Converter{timeout: time.Second, sem: make(chan struct{}, 1)}
	rec := httptest.NewRecorder()
	c.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/convert", strings.NewReader("")))
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d", rec.Code)
	}
}

func TestRejectsNonMultipart(t *testing.T) {
	c := &Converter{soffice: "soffice", timeout: time.Second, sem: make(chan struct{}, 1)}
	rec := httptest.NewRecorder()
	c.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/convert", strings.NewReader("hello")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
