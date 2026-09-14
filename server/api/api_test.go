package api

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"hanjavocab/server/anki"
	"hanjavocab/server/model"
	"hanjavocab/server/storage"
)

type fakeAnki struct {
	err error
}

func (f fakeAnki) Metadata(context.Context) (model.AnkiMetadata, error) {
	return model.AnkiMetadata{Connected: true, Version: 6, Decks: []string{"Hanja"}, NoteTypes: []string{"Hanja"}}, f.err
}

func (f fakeAnki) NoteTypes(context.Context, string) ([]string, error) {
	return []string{"Hanja"}, f.err
}

func (f fakeAnki) Fields(context.Context, string) ([]string, error) {
	return []string{"Char", "Grade"}, f.err
}

func (f fakeAnki) Status(context.Context, anki.StatusRequest) (model.AnkiStatus, error) {
	return model.AnkiStatus{Total: 1, Known: 1, Characters: map[string]model.CharacterStatusInfo{"人": {Status: model.StatusKnown}}}, f.err
}

func (f fakeAnki) IdiomStatus(context.Context, anki.IdiomStatusRequest) (model.AnkiIdiomStatus, error) {
	return model.AnkiIdiomStatus{Total: 1, New: 1, Idioms: map[string]model.CharacterStatusInfo{"一字千金": {Status: model.StatusNew}}}, f.err
}

type fakeLevels struct{}

func (fakeLevels) Data() model.LevelCatalog {
	return model.LevelCatalog{Total: 1, Groups: []model.CatalogGroup{{Level: "8급", Characters: []string{"人"}}}}
}

type fakeIdioms struct{}

func (fakeIdioms) Data() model.IdiomCatalog {
	return model.IdiomCatalog{Total: 1, Entries: []model.Idiom{{Korean: "각양각색", Hanja: "各樣各色"}}}
}

type fakeVocab struct{}

func (fakeVocab) Search(_ []string, _ int) model.VocabResult {
	return model.VocabResult{Total: 1, Entries: []model.VocabEntry{{Hanja: "人", Hangul: "인"}}}
}

type fakeSaves struct {
	values map[string]model.SavedSelection
}

func (f *fakeSaves) List() ([]model.SavedSelectionInfo, error) {
	result := make([]model.SavedSelectionInfo, 0, len(f.values))
	for name, value := range f.values {
		result = append(result, model.SavedSelectionInfo{Name: name, SavedAt: value.SavedAt, Selected: len(value.Selected)})
	}
	return result, nil
}

func (f *fakeSaves) Load(name string) (model.SavedSelection, error) {
	value, ok := f.values[name]
	if !ok {
		return model.SavedSelection{}, storage.ErrNotFound
	}
	return value, nil
}

func (f *fakeSaves) Save(name string, value model.SavedSelection) (model.SavedSelection, error) {
	value.Version = 1
	value.SavedAt = time.Now()
	f.values[name] = value
	return value, nil
}

func (f *fakeSaves) Delete(name string) error {
	if _, ok := f.values[name]; !ok {
		return storage.ErrNotFound
	}
	delete(f.values, name)
	return nil
}

func testServer(ankiService ankiAPI) http.Handler {
	files := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("Hanja Vocab")}}
	return NewServer(ankiService, fakeLevels{}, fakeIdioms{}, fakeVocab{}, &fakeSaves{values: make(map[string]model.SavedSelection)}, files).ServeMux()
}

func TestSaveRoutes(t *testing.T) {
	saves := &fakeSaves{values: make(map[string]model.SavedSelection)}
	files := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("Hanja Vocab")}}
	handler := NewServer(fakeAnki{}, fakeLevels{}, fakeIdioms{}, fakeVocab{}, saves, files).ServeMux()
	payload := `{"deck":"Hanja","noteType":"Hanja","characterField":"Char","selected":["人"]}`

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/saves/daily", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("save status=%d body=%q", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/saves/daily", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"selected":["人"]`) {
		t.Fatalf("load status=%d body=%q", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/saves/daily", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestHealthAndStaticClient(t *testing.T) {
	handler := testServer(fakeAnki{})
	for _, test := range []struct {
		path string
		body string
	}{
		{path: "/healthz", body: "ok\n"},
		{path: "/", body: "Hanja Vocab"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
		if response.Code != http.StatusOK || response.Body.String() != test.body {
			t.Fatalf("%s: status=%d body=%q", test.path, response.Code, response.Body.String())
		}
	}
}

func TestAnkiRoutes(t *testing.T) {
	handler := testServer(fakeAnki{})
	tests := []struct {
		method string
		path   string
		body   string
		want   string
	}{
		{http.MethodGet, "/api/anki", "", `"connected":true`},
		{http.MethodGet, "/api/anki/note-types?deck=Hanja", "", `"noteTypes":["Hanja"]`},
		{http.MethodGet, "/api/anki/fields?noteType=Hanja", "", `"fields":["Char","Grade"]`},
		{http.MethodPost, "/api/anki/status", `{"deck":"Hanja","noteType":"Hanja","characterField":"Char"}`, `"total":1`},
		{http.MethodPost, "/api/anki/idiom-status", `{"deck":"Idioms","noteType":"사자성어","idiomField":"Char"}`, `"一字千金"`},
		{http.MethodGet, "/api/levels", "", `"level":"8급"`},
		{http.MethodGet, "/api/idioms", "", `"korean":"각양각색"`},
	}
	for _, test := range tests {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), test.want) {
			t.Fatalf("%s: status=%d body=%q", test.path, response.Code, response.Body.String())
		}
	}
}

func TestVocabularyRoute(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/vocab", strings.NewReader(`{"characters":["人"]}`))
	testServer(fakeAnki{}).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"hanja":"人"`) {
		t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestValidationAndUpstreamErrors(t *testing.T) {
	tests := []struct {
		name    string
		handler http.Handler
		method  string
		path    string
		body    io.Reader
		status  int
	}{
		{"missing note type", testServer(fakeAnki{}), http.MethodGet, "/api/anki/fields", nil, http.StatusBadRequest},
		{"missing deck", testServer(fakeAnki{}), http.MethodGet, "/api/anki/note-types", nil, http.StatusBadRequest},
		{"missing characters", testServer(fakeAnki{}), http.MethodPost, "/api/vocab", strings.NewReader(`{"characters":[]}`), http.StatusBadRequest},
		{"missing idiom field", testServer(fakeAnki{}), http.MethodPost, "/api/anki/idiom-status", strings.NewReader(`{"deck":"Idioms","noteType":"사자성어"}`), http.StatusBadRequest},
		{"unknown JSON field", testServer(fakeAnki{}), http.MethodPost, "/api/vocab", strings.NewReader(`{"characters":["人"],"extra":1}`), http.StatusBadRequest},
		{"Anki unavailable", testServer(fakeAnki{err: errors.New("offline")}), http.MethodGet, "/api/anki", nil, http.StatusServiceUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			test.handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, test.body))
			if response.Code != test.status || !strings.Contains(response.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("status=%d content-type=%q body=%q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
			}
		})
	}
}
