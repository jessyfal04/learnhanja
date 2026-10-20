package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestImageQuestionUsesAllowedLevelTargetAndCachesForms(t *testing.T) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>`
	apiCalls, mediaCalls := 0, 0
	var upstream *httptest.Server
	upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != glyphUserAgent {
			t.Error("missing Commons User-Agent")
		}
		if r.URL.Path == "/glyph.svg" {
			mediaCalls++
			_, _ = w.Write([]byte(svg))
			return
		}
		apiCalls++
		if !strings.Contains(r.URL.Query().Get("titles"), "File:雲-bigseal.svg") {
			t.Error("five forms not queried")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"query": map[string]any{"pages": []any{map[string]any{
			"title":     "File:雲-seal.svg",
			"imageinfo": []any{map[string]string{"url": upstream.URL + "/glyph.svg", "descriptionurl": "https://commons.wikimedia.org/wiki/File:%E9%9B%B2-seal.svg", "mime": "image/svg+xml"}},
		}}}})
	}))
	defer upstream.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service, images: imageOptions{endpoint: upstream.URL, client: upstream.Client(), cacheDir: t.TempDir()}}
	request := func(level, hanja string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		body := fmt.Sprintf(`{"level":%q,"hanja":%q}`, level, hanja)
		server.imageQuestion(recorder, httptest.NewRequest(http.MethodPost, "/api/mock-exam/image", bytes.NewBufferString(body)))
		return recorder
	}
	if bad := request("7", "人"); bad.Code != http.StatusBadRequest || apiCalls != 0 {
		t.Fatalf("bad target: %d, API calls=%d", bad.Code, apiCalls)
	}
	for i := 0; i < 2; i++ {
		good := request("7", "雲")
		var result glyphResult
		if good.Code != http.StatusOK || json.Unmarshal(good.Body.Bytes(), &result) != nil {
			t.Fatalf("glyph: %d %s", good.Code, good.Body.String())
		}
		if result.Hanja != "雲" || result.Form != "seal" || result.SourcePage != "https://commons.wikimedia.org/wiki/File:%E9%9B%B2-seal.svg" || result.Image != "data:image/svg+xml;base64,"+base64.StdEncoding.EncodeToString([]byte(svg)) {
			t.Fatalf("unexpected glyph result: %+v", result)
		}
	}
	if apiCalls != 1 || mediaCalls != 1 {
		t.Fatalf("cache missed: API=%d media=%d", apiCalls, mediaCalls)
	}
}

func TestWiktionaryAliasesUseEverySVGAndCacheVariantsSeparately(t *testing.T) {
	options := newImageOptions(os.DirFS("../../client"))
	if len(options.aliases) != 7 || len(options.aliases["內"]["bronze"]) != 36 {
		t.Fatalf("old-script aliases not loaded: %+v", options.aliases["內"])
	}
	apiCalls := 0
	var upstream *httptest.Server
	upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`))
			return
		}
		apiCalls++
		titles := strings.Split(r.URL.Query().Get("titles"), "|")
		if len(titles) > 50 {
			t.Fatalf("Commons title batch too large: %d", len(titles))
		}
		pages := make([]any, 0, len(titles))
		for _, title := range titles {
			if !strings.HasPrefix(title, "File:ACC-") {
				continue
			}
			filename := strings.TrimPrefix(title, "File:")
			pages = append(pages, map[string]any{"title": title, "imageinfo": []any{map[string]string{
				"url": upstream.URL + "/" + filename, "descriptionurl": "https://commons.wikimedia.org/wiki/File:" + filename, "mime": "image/svg+xml",
			}}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"query": map[string]any{"pages": pages}})
	}))
	defer upstream.Close()
	options.endpoint = upstream.URL
	options.client = upstream.Client()
	options.cacheDir = t.TempDir()
	sources, err := options.glyphSources(context.Background(), "內")
	if err != nil || len(sources) != 69 || apiCalls != 2 {
		t.Fatalf("alias sources: count=%d API=%d error=%v", len(sources), apiCalls, err)
	}
	var bronze []glyphSource
	for _, source := range sources {
		if source.Form == "bronze" {
			bronze = append(bronze, source)
		}
	}
	if len(bronze) != 36 {
		t.Fatalf("bronze variants: %d", len(bronze))
	}
	for _, source := range bronze[:2] {
		if _, err := options.cachedGlyph(context.Background(), "內", source); err != nil {
			t.Fatal(err)
		}
	}
	files, err := os.ReadDir(options.cacheDir)
	if err != nil || len(files) != 2 {
		t.Fatalf("variant cache files: %d, %v", len(files), err)
	}
}
