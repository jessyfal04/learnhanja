package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"learnhanja/server/model"
)

type fakeVocab struct{}

func (fakeVocab) Related(_ []string) model.VocabResult {
	return model.VocabResult{Total: 1, Entries: []model.VocabEntry{{Hanja: "人生", Hangul: "인생"}}}
}

func (fakeVocab) Search(_ []string, _ int) model.VocabResult {
	return model.VocabResult{Total: 1, Entries: []model.VocabEntry{{Hanja: "人", Hangul: "인"}}}
}

func testServer() http.Handler {
	files := fstest.MapFS{
		"index.html":       &fstest.MapFile{Data: []byte("LearnHanja")},
		"data/levels.json": &fstest.MapFile{Data: []byte(`{"total":3500}`)},
		"data/idioms.json": &fstest.MapFile{Data: []byte(`{"total":383}`)},
	}
	return NewServer(fakeVocab{}, files).ServeMux()
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
		{path: "/data/idioms.json", body: `{"total":383}`},
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

func TestVocabularyRoute(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/vocab", strings.NewReader(`{"characters":["人"]}`))
	testServer().ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"hanja":"人"`) {
		t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestVocabularyValidation(t *testing.T) {
	tests := []struct {
		name string
		body io.Reader
	}{
		{"missing characters", strings.NewReader(`{"characters":[]}`)},
		{"unknown JSON field", strings.NewReader(`{"characters":["人"],"extra":1}`)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			testServer().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/vocab", test.body))
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("status=%d content-type=%q body=%q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
			}
		})
	}
}

func TestRemovedServerAPIs(t *testing.T) {
	for _, path := range []string{"/api/anki", "/api/levels", "/api/idioms", "/api/saves"} {
		response := httptest.NewRecorder()
		testServer().ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s: status=%d body=%q", path, response.Code, response.Body.String())
		}
	}
}

func TestInsightVocabularyRoute(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"characters":["人"]}`, http.StatusOK},
		{`{"characters":["𠀀"]}`, http.StatusOK},
		{`{"characters":[]}`, http.StatusBadRequest},
		{`{"characters":["人生"]}`, http.StatusBadRequest},
		{`{"characters":["人"],"extra":1}`, http.StatusBadRequest},
		{`{`, http.StatusBadRequest},
		{`{"characters":[` + strings.Repeat(`"人",`, 256) + `"人"]}`, http.StatusBadRequest},
	} {
		response := httptest.NewRecorder()
		testServer().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/insights/vocab", strings.NewReader(test.body)))
		if response.Code != test.status {
			t.Fatalf("body=%s status=%d want=%d", test.body, response.Code, test.status)
		}
		if test.status == http.StatusOK && !strings.Contains(response.Body.String(), `"hanja":"人生"`) {
			t.Fatalf("missing related word: %s", response.Body.String())
		}
	}
}
