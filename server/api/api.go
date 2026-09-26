package api

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"

	"learnhanja/server/model"
)

type VocabStore interface {
	Search([]string, int) model.VocabResult
	Related([]string) model.VocabResult
}

type Server struct {
	vocab VocabStore
	files fs.FS
}

func NewServer(vocabStore VocabStore, files fs.FS) *Server {
	return &Server{vocab: vocabStore, files: files}
}

func (s *Server) ServeMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.logged(s.health))
	mux.HandleFunc("POST /api/vocab", s.logged(s.vocabulary))
	mux.HandleFunc("POST /api/insights/vocab", s.logged(s.insightVocabulary))
	mux.Handle("GET /", s.loggedHandler(s.staticFiles()))
	return mux
}

func (s *Server) insightVocabulary(w http.ResponseWriter, r *http.Request) {
	var request vocabRequest
	if !readJSON(w, r, &request) {
		return
	}
	if len(request.Characters) == 0 || len(request.Characters) > 256 {
		writeError(w, http.StatusBadRequest, fmt.Errorf("한자를 1~256자 입력하세요"))
		return
	}
	for _, character := range request.Characters {
		if len([]rune(character)) != 1 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("각 항목은 한 글자여야 합니다"))
			return
		}
	}
	writeJSON(w, http.StatusOK, s.vocab.Related(request.Characters))
}

func (s *Server) staticFiles() http.Handler {
	files := http.FileServer(http.FS(s.files))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		files.ServeHTTP(w, r)
	})
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
