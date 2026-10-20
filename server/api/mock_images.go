package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const commonsImageAPI = "https://commons.wikimedia.org/w/api.php"
const glyphUserAgent = "LearnHanjaMockExam/1.0 (https://github.com/jessyfal04/learnhanja)"

var glyphForms = []string{"seal", "bronze", "oracle", "ancient", "bigseal"}

type glyphSource struct {
	Form string
	URL  string
	Page string
}

type glyphResult struct {
	Hanja      string `json:"hanja"`
	Form       string `json:"form"`
	Image      string `json:"image"`
	SourcePage string `json:"sourcePage"`
}

type imageOptions struct {
	endpoint string
	client   *http.Client
	cacheDir string
	aliases  map[string]map[string][]string
	mu       sync.Mutex
	sources  map[string][]glyphSource
}

func newImageOptions(files fs.FS) imageOptions {
	options := imageOptions{client: &http.Client{Timeout: 30 * time.Second}}
	data, err := fs.ReadFile(files, "data/mock-exam-old-script-files.json")
	if err != nil {
		log.Printf("mock glyph aliases unavailable: %v", err)
		return options
	}
	var entries map[string]struct {
		Forms map[string][]string `json:"forms"`
	}
	if err := json.Unmarshal(data, &entries); err != nil {
		log.Printf("mock glyph aliases invalid: %v", err)
		return options
	}
	options.aliases = make(map[string]map[string][]string, len(entries))
	for hanja, entry := range entries {
		if utf8.RuneCountInString(hanja) != 1 {
			continue
		}
		options.aliases[hanja] = make(map[string][]string)
		for form, filenames := range entry.Forms {
			if !slices.Contains(glyphForms, form) {
				continue
			}
			for _, filename := range filenames {
				if strings.HasSuffix(filename, ".svg") && !strings.ContainsAny(filename, "/|?#") {
					options.aliases[hanja][form] = append(options.aliases[hanja][form], filename)
				}
			}
		}
	}
	return options
}

func (s *Server) imageQuestion(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "옛 글자 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Level string `json:"level"`
		Hanja string `json:"hanja"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "옛 글자 요청이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	grade, ok := s.sentences.grades[request.Level]
	if !ok {
		http.Error(w, "지원하지 않는 급수입니다", http.StatusBadRequest)
		return
	}
	if !grade.pictures[request.Hanja] || utf8.RuneCountInString(request.Hanja) != 1 {
		http.Error(w, "급수에 없는 옛 글자 대상입니다", http.StatusBadRequest)
		return
	}
	result, err := s.images.glyph(r.Context(), request.Hanja)
	if err != nil {
		log.Printf("mock glyph: %v", err)
		http.Error(w, "옛 글자를 준비할 수 없습니다. 잠시 후 다시 시도하세요", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(result)
}

func (options *imageOptions) glyph(ctx context.Context, hanja string) (glyphResult, error) {
	sources, err := options.glyphSources(ctx, hanja)
	if err != nil {
		return glyphResult{}, err
	}
	if len(sources) == 0 {
		return glyphResult{}, fmt.Errorf("no old-script form for %s", hanja)
	}
	remaining := append([]glyphSource(nil), sources...)
	for len(remaining) > 0 {
		choice, err := rand.Int(rand.Reader, big.NewInt(int64(len(remaining))))
		if err != nil {
			return glyphResult{}, err
		}
		index := int(choice.Int64())
		source := remaining[index]
		remaining = append(remaining[:index], remaining[index+1:]...)
		result, err := options.cachedGlyph(ctx, hanja, source)
		if err == nil {
			return result, nil
		}
		log.Printf("mock glyph %s %s: %v", hanja, source.Form, err)
	}
	return glyphResult{}, fmt.Errorf("all old-script forms unavailable for %s", hanja)
}

func (options *imageOptions) glyphSources(ctx context.Context, hanja string) ([]glyphSource, error) {
	options.mu.Lock()
	defer options.mu.Unlock()
	if sources, ok := options.sources[hanja]; ok {
		return sources, nil
	}
	endpoint := options.endpoint
	if endpoint == "" {
		endpoint = commonsImageAPI
	}
	type candidate struct{ title, form string }
	var candidates []candidate
	seenTitles := make(map[string]bool)
	for _, form := range glyphForms {
		filenames := append([]string{hanja + "-" + form + ".svg"}, options.aliases[hanja][form]...)
		for _, filename := range filenames {
			title := "File:" + filename
			if seenTitles[title] {
				continue
			}
			seenTitles[title] = true
			candidates = append(candidates, candidate{title, form})
		}
	}
	client := options.client
	if client == nil {
		client = http.DefaultClient
	}
	var sources []glyphSource
	seenURLs := make(map[string]bool)
	for start := 0; start < len(candidates); start += 50 {
		batch := candidates[start:min(start+50, len(candidates))]
		titles := make([]string, 0, len(batch))
		for _, item := range batch {
			titles = append(titles, item.title)
		}
		values := url.Values{
			"action": {"query"}, "format": {"json"}, "formatversion": {"2"},
			"prop": {"imageinfo"}, "iiprop": {"url|mime"}, "titles": {strings.Join(titles, "|")},
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+values.Encode(), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("User-Agent", glyphUserAgent)
		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		if response.StatusCode != http.StatusOK {
			response.Body.Close()
			return nil, fmt.Errorf("Commons API HTTP %d", response.StatusCode)
		}
		var result struct {
			Query struct {
				Pages []struct {
					Title     string `json:"title"`
					ImageInfo []struct {
						URL            string `json:"url"`
						DescriptionURL string `json:"descriptionurl"`
						MIME           string `json:"mime"`
					} `json:"imageinfo"`
				} `json:"pages"`
			} `json:"query"`
		}
		err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result)
		response.Body.Close()
		if err != nil {
			return nil, err
		}
		pages := make(map[string]struct{ URL, Page, MIME string })
		for _, page := range result.Query.Pages {
			if len(page.ImageInfo) == 0 {
				continue
			}
			info := page.ImageInfo[0]
			pages[page.Title] = struct{ URL, Page, MIME string }{info.URL, info.DescriptionURL, info.MIME}
		}
		for _, item := range batch {
			info, ok := pages[item.title]
			if !ok || info.MIME != "image/svg+xml" || seenURLs[info.URL] {
				continue
			}
			mediaURL, err := url.Parse(info.URL)
			if err != nil || endpoint == commonsImageAPI && (mediaURL.Scheme != "https" || mediaURL.Host != "upload.wikimedia.org") {
				continue
			}
			seenURLs[info.URL] = true
			sources = append(sources, glyphSource{Form: item.form, URL: info.URL, Page: info.Page})
		}
	}
	if options.sources == nil {
		options.sources = make(map[string][]glyphSource)
	}
	options.sources[hanja] = sources
	return sources, nil
}

func (options *imageOptions) cachedGlyph(ctx context.Context, hanja string, source glyphSource) (glyphResult, error) {
	cacheDir := options.cacheDir
	if cacheDir == "" {
		cacheDir = filepath.Join(os.TempDir(), "learnhanja-old-script-glyphs")
	}
	digest := sha256.Sum256([]byte(source.URL))
	path := filepath.Join(cacheDir, fmt.Sprintf("U+%04X-%s-%x.json", []rune(hanja)[0], source.Form, digest[:8]))
	if data, err := os.ReadFile(path); err == nil {
		var cached glyphResult
		if json.Unmarshal(data, &cached) == nil && cached.Hanja == hanja && cached.Form == source.Form && strings.HasPrefix(cached.Image, "data:image/svg+xml;base64,") {
			return cached, nil
		}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return glyphResult{}, err
	}
	request.Header.Set("User-Agent", glyphUserAgent)
	client := options.client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return glyphResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return glyphResult{}, fmt.Errorf("Commons SVG HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20+1))
	if err != nil || len(data) > 1<<20 || !bytes.Contains(data[:min(len(data), 1024)], []byte("<svg")) {
		return glyphResult{}, fmt.Errorf("invalid Commons SVG for %s %s", hanja, source.Form)
	}
	var root struct{ XMLName xml.Name }
	if xml.Unmarshal(data, &root) != nil || root.XMLName.Local != "svg" {
		return glyphResult{}, fmt.Errorf("invalid SVG XML for %s %s", hanja, source.Form)
	}
	result := glyphResult{Hanja: hanja, Form: source.Form, Image: "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(data), SourcePage: source.Page}
	if err := os.MkdirAll(cacheDir, 0700); err != nil {
		return glyphResult{}, err
	}
	encoded, _ := json.Marshal(result)
	if err := os.WriteFile(path, encoded, 0600); err != nil {
		return glyphResult{}, err
	}
	return result, nil
}
