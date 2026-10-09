package api

import (
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"
)

type Server struct {
	files       fs.FS
	sentences   *sentenceService
	sentenceErr error
}

func NewServer(files fs.FS) *Server {
	sentences, err := newSentenceService(files, sentenceOptions{
		apiKey: os.Getenv("OPENAI_API_KEY"),
		model:  os.Getenv("OPENAI_MODEL"),
		client: &http.Client{Timeout: 45 * time.Second},
	})
	return &Server{files: files, sentences: sentences, sentenceErr: err}
}

func (s *Server) ServeMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.logged(s.health))
	mux.HandleFunc("GET /api/mock-exam/sentences", s.logged(s.sentenceManifest))
	mux.HandleFunc("POST /api/mock-exam/sentence", s.logged(s.sentence))
	mux.Handle("GET /", s.loggedHandler(s.staticFiles()))
	return mux
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
