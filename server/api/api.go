package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"hanjavocab/server/anki"
	"hanjavocab/server/model"
	"hanjavocab/server/storage"
)

type ankiAPI interface {
	Metadata(context.Context) (model.AnkiMetadata, error)
	NoteTypes(context.Context, string) ([]string, error)
	Fields(context.Context, string) ([]string, error)
	Status(context.Context, anki.StatusRequest) (model.AnkiStatus, error)
}

type LevelCatalog interface {
	Data() model.LevelCatalog
}

type IdiomCatalog interface {
	Data() model.IdiomCatalog
}

type VocabStore interface {
	Search([]string, int) model.VocabResult
}

type SaveStore interface {
	List() ([]model.SavedSelectionInfo, error)
	Load(string) (model.SavedSelection, error)
	Save(string, model.SavedSelection) (model.SavedSelection, error)
	Delete(string) error
}

type Server struct {
	anki   ankiAPI
	levels LevelCatalog
	idioms IdiomCatalog
	vocab  VocabStore
	saves  SaveStore
	files  fs.FS
}

func NewServer(ankiService ankiAPI, levelCatalog LevelCatalog, idiomCatalog IdiomCatalog, vocabStore VocabStore, saveStore SaveStore, files fs.FS) *Server {
	return &Server{anki: ankiService, levels: levelCatalog, idioms: idiomCatalog, vocab: vocabStore, saves: saveStore, files: files}
}

func (s *Server) ServeMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.logged(s.health))
	mux.HandleFunc("GET /api/anki", s.logged(s.ankiMetadata))
	mux.HandleFunc("GET /api/anki/note-types", s.logged(s.ankiNoteTypes))
	mux.HandleFunc("GET /api/anki/fields", s.logged(s.ankiFields))
	mux.HandleFunc("POST /api/anki/status", s.logged(s.ankiStatus))
	mux.HandleFunc("GET /api/levels", s.logged(s.levelCatalog))
	mux.HandleFunc("GET /api/idioms", s.logged(s.idiomCatalog))
	mux.HandleFunc("POST /api/vocab", s.logged(s.vocabulary))
	mux.HandleFunc("GET /api/saves", s.logged(s.savedSelections))
	mux.HandleFunc("GET /api/saves/{name}", s.logged(s.loadSelection))
	mux.HandleFunc("PUT /api/saves/{name}", s.logged(s.saveSelection))
	mux.HandleFunc("DELETE /api/saves/{name}", s.logged(s.deleteSelection))
	mux.Handle("GET /", s.loggedHandler(http.FileServer(http.FS(s.files))))
	return mux
}

func (s *Server) savedSelections(w http.ResponseWriter, _ *http.Request) {
	selections, err := s.saves.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string][]model.SavedSelectionInfo{"saves": selections})
}

func (s *Server) loadSelection(w http.ResponseWriter, r *http.Request) {
	selection, err := s.saves.Load(r.PathValue("name"))
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, selection)
}

func (s *Server) saveSelection(w http.ResponseWriter, r *http.Request) {
	var selection model.SavedSelection
	if !readJSON(w, r, &selection) {
		return
	}
	saved, err := s.saves.Save(r.PathValue("name"), selection)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) deleteSelection(w http.ResponseWriter, r *http.Request) {
	err := s.saves.Delete(r.PathValue("name"))
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) ankiNoteTypes(w http.ResponseWriter, r *http.Request) {
	deck := strings.TrimSpace(r.URL.Query().Get("deck"))
	if deck == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("deck is required"))
		return
	}
	noteTypes, err := s.anki.NoteTypes(r.Context(), deck)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"noteTypes": noteTypes})
}

func (s *Server) logged(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.RequestURI())
		next(w, r)
	}
}

func (s *Server) loggedHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.RequestURI())
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok\n"))
}

func (s *Server) ankiMetadata(w http.ResponseWriter, r *http.Request) {
	metadata, err := s.anki.Metadata(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	writeJSON(w, http.StatusOK, metadata)
}

func (s *Server) ankiFields(w http.ResponseWriter, r *http.Request) {
	noteType := strings.TrimSpace(r.URL.Query().Get("noteType"))
	if noteType == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("noteType is required"))
		return
	}
	fields, err := s.anki.Fields(r.Context(), noteType)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"fields": fields})
}

func (s *Server) ankiStatus(w http.ResponseWriter, r *http.Request) {
	var request anki.StatusRequest
	if !readJSON(w, r, &request) {
		return
	}
	if strings.TrimSpace(request.Deck) == "" || strings.TrimSpace(request.NoteType) == "" || strings.TrimSpace(request.CharacterField) == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("deck, noteType, and characterField are required"))
		return
	}
	status, err := s.anki.Status(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) levelCatalog(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.levels.Data())
}

func (s *Server) idiomCatalog(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.idioms.Data())
}

type vocabRequest struct {
	Characters []string `json:"characters"`
	Limit      int      `json:"limit"`
}

func (s *Server) vocabulary(w http.ResponseWriter, r *http.Request) {
	var request vocabRequest
	if !readJSON(w, r, &request) {
		return
	}
	if len(request.Characters) == 0 {
		writeError(w, http.StatusBadRequest, fmt.Errorf("select at least one character"))
		return
	}
	writeJSON(w, http.StatusOK, s.vocab.Search(request.Characters, request.Limit))
}

func readJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON: %w", err))
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
