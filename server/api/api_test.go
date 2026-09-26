package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func testServer() http.Handler {
	files := fstest.MapFS{
		"index.html":           &fstest.MapFile{Data: []byte("LearnHanja")},
		"data/levels.json":     &fstest.MapFile{Data: []byte(`{"total":3500}`)},
		"data/idioms.json":     &fstest.MapFile{Data: []byte(`{"total":447}`)},
		"data/vocabulary.json": &fstest.MapFile{Data: []byte(`[["人","인",[],[],0,1]]`)},
	}
	return NewServer(files).ServeMux()
}

func TestHealthAndStaticClient(t *testing.T) {
	handler := testServer()
	for _, test := range []struct {
		path string
		body string
	}{
		{path: "/healthz", body: "ok\n"},
		{path: "/", body: "LearnHanja"},
		{path: "/data/levels.json", body: `{"total":3500}`},
		{path: "/data/idioms.json", body: `{"total":447}`},
		{path: "/data/vocabulary.json", body: `[["人","인",[],[],0,1]]`},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
		if response.Code != http.StatusOK || response.Body.String() != test.body {
			t.Fatalf("%s: status=%d body=%q", test.path, response.Code, response.Body.String())
		}
		if test.path != "/healthz" && response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: cache-control=%q", test.path, response.Header().Get("Cache-Control"))
		}
	}
}

func TestApplicationAPIsAreRemoved(t *testing.T) {
	for _, path := range []string{"/api/vocab", "/api/insights/vocab", "/api/anki", "/api/levels", "/api/idioms", "/api/saves"} {
		response := httptest.NewRecorder()
		testServer().ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, nil))
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s: status=%d body=%q", path, response.Code, response.Body.String())
		}
	}
}
