package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func testReaderService(t *testing.T, endpoint string, client *http.Client) *readerService {
	t.Helper()
	files := fstest.MapFS{"data/vocabulary.json": &fstest.MapFile{Data: []byte(`[["警察","경찰",[],["치안을 맡는 기관"]],["觀察","관찰",[],["살펴봄"]],["經濟","경제",[],["생산과 소비"]]]`)}}
	service, err := newReaderService(files, sentenceOptions{apiKey: "test-key", endpoint: endpoint, client: client})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func TestReaderPassageValidation(t *testing.T) {
	service := testReaderService(t, "", nil)
	allowed, err := service.validateRequest(readerRequest{Subject: "한국사", Length: "short", Words: []readerWord{{Hanja: "警察", Hangul: "경찰"}, {Hanja: "觀察", Hangul: "관찰"}, {Hanja: "經濟", Hangul: "경제"}}})
	if err != nil {
		t.Fatal(err)
	}
	good := readerPassage{Segments: []readerSegment{{Text: strings.Repeat("오늘은 한국의 역사와 도시 생활을 차분하게 돌아보았다. ", 3), Hanja: ""}, {Text: "경찰", Hanja: "警察"}, {Text: "과 ", Hanja: ""}, {Text: "관찰", Hanja: "觀察"}, {Text: " 그리고 ", Hanja: ""}, {Text: "경제", Hanja: "經濟"}, {Text: " 이야기가 이어졌다.", Hanja: ""}}}
	if err := validateReaderPassage(good, "short", allowed); err != nil {
		t.Fatal(err)
	}
	bad := good
	bad.Segments = append([]readerSegment(nil), good.Segments...)
	bad.Segments[1].Hanja = "警官"
	if err := validateReaderPassage(bad, "short", allowed); err == nil {
		t.Fatal("unrecognized spelling accepted")
	}
	bad.Segments[1] = readerSegment{Text: "警察", Hanja: "警察"}
	if err := validateReaderPassage(bad, "short", allowed); err == nil {
		t.Fatal("Han in source accepted")
	}
	if _, err := service.validateRequest(readerRequest{Subject: "한국사", Length: "short", Words: []readerWord{{Hanja: "未知", Hangul: "미지"}, {Hanja: "觀察", Hangul: "관찰"}, {Hanja: "經濟", Hangul: "경제"}}}); err == nil {
		t.Fatal("unlisted word accepted")
	}
}

func TestReaderAccessRateAndRetry(t *testing.T) {
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing backend key")
		}
		passage := readerPassage{Segments: []readerSegment{{Text: strings.Repeat("오늘은 한국의 역사와 도시 생활을 차분하게 돌아보았다. ", 3), Hanja: ""}, {Text: "경찰", Hanja: "警察"}, {Text: "과 ", Hanja: ""}, {Text: "관찰", Hanja: "觀察"}, {Text: " 그리고 ", Hanja: ""}, {Text: "경제", Hanja: "經濟"}, {Text: " 이야기가 이어졌다.", Hanja: ""}}}
		if calls == 1 {
			passage.Segments[1].Hanja = "警官"
		}
		encoded, _ := json.Marshal(passage)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(encoded)}}}}})
	}))
	defer openai.Close()
	service := testReaderService(t, openai.URL, openai.Client())
	server := &Server{reader: service}
	body := `{"subject":"한국사","length":"short","words":[{"hanja":"警察","hangul":"경찰"},{"hanja":"觀察","hangul":"관찰"},{"hanja":"經濟","hangul":"경제"}]}`
	request := func(origin string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "http://example.test/api/reader/generate", strings.NewReader(body))
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}
	for _, origin := range []string{"", "http://elsewhere.test"} {
		response := httptest.NewRecorder()
		server.readerGenerate(response, request(origin))
		if response.Code != http.StatusForbidden || calls != 0 {
			t.Fatalf("origin %q: %d calls=%d", origin, response.Code, calls)
		}
	}
	response := httptest.NewRecorder()
	server.readerGenerate(response, request("http://example.test"))
	if response.Code != http.StatusOK || calls != 2 {
		t.Fatalf("generation: %d calls=%d body=%s", response.Code, calls, response.Body.String())
	}
	crossSite := request("http://example.test")
	crossSite.Header.Set("Sec-Fetch-Site", "cross-site")
	response = httptest.NewRecorder()
	server.readerGenerate(response, crossSite)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-site fetch: %d", response.Code)
	}
	for i := 0; i < 19; i++ {
		if !service.allow("other", time.Now()) {
			t.Fatal("premature limit")
		}
	}
	if !service.allow("other", time.Now()) || service.allow("other", time.Now()) {
		t.Fatal("rate limit")
	}
	for i := 0; i < 39; i++ {
		if !service.allow("another"+string(rune('a'+i)), time.Now()) {
			t.Fatal("premature global limit")
		}
	}
	if service.allow("last", time.Now()) {
		t.Fatal("global daily limit")
	}
	if !service.allow("other", time.Now().Add(24*time.Hour+time.Minute)) {
		t.Fatal("rate limit did not expire")
	}
}
