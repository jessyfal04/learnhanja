package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSentenceGenerationUsesVerifiedGradeWord(t *testing.T) {
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing server key")
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if payload["model"] != "gpt-6-luna" {
			t.Errorf("model = %v", payload["model"])
		}
		if !strings.Contains(payload["input"].(string), "人口") || !strings.Contains(payload["input"].(string), "급수: 8급") {
			t.Errorf("grade or target missing")
		}
		text := "이 도시의 人口는 해마다 늘고 있다."
		if calls == 1 {
			text = "이 도시의 인구는 해마다 늘고 있다."
		}
		encoded, _ := json.Marshal(map[string]string{"text": text})
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(encoded)}}}}})
	}))
	defer openai.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{apiKey: "test-key", endpoint: openai.URL, client: openai.Client()})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	manifest := httptest.NewRecorder()
	server.sentenceManifest(manifest, httptest.NewRequest(http.MethodGet, "/api/mock-exam/sentences?level=8", nil))
	if manifest.Code != http.StatusOK || !strings.Contains(manifest.Body.String(), `"sentenceSound"`) || !strings.Contains(manifest.Body.String(), "人口") || !strings.Contains(manifest.Body.String(), `"generationEnabled":true`) {
		t.Fatalf("manifest: %d %s", manifest.Code, manifest.Body.String())
	}
	request := httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"8","type":"sentenceSound","hanja":"人口"}`))
	response := httptest.NewRecorder()
	server.sentence(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("sentence: %d %s", response.Code, response.Body.String())
	}
	var answer sentenceAnswer
	if err := json.Unmarshal(response.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || answer.Hanja != "人口" || answer.Reading != "인구" || answer.Source != "ChatGPT" || !strings.Contains(answer.Sentence, "人口") {
		t.Fatalf("calls=%d answer=%+v", calls, answer)
	}
	bad := httptest.NewRecorder()
	server.sentence(bad, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"8","type":"sentenceSound","hanja":"未知"}`)))
	if bad.Code != http.StatusBadRequest || calls != 2 {
		t.Fatalf("invalid word: %d calls=%d", bad.Code, calls)
	}
}

func TestSentenceFallsBackToKRDictWithoutServerKey(t *testing.T) {
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	response := httptest.NewRecorder()
	server.sentence(response, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"8","type":"sentenceSound","hanja":"人口"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"source":"KRDict"`) {
		t.Fatalf("fallback: %d %s", response.Code, response.Body.String())
	}
}

func TestSentenceFallsBackWhenGPTFails(t *testing.T) {
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Error(w, "temporary failure", http.StatusServiceUnavailable)
	}))
	defer openai.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{apiKey: "test-key", endpoint: openai.URL, client: openai.Client()})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	response := httptest.NewRecorder()
	server.sentence(response, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"8","type":"sentenceSound","hanja":"人口"}`)))
	if response.Code != http.StatusOK || calls != 1 || !strings.Contains(response.Body.String(), `"source":"KRDict"`) {
		t.Fatalf("fallback: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestReadingContextCanVaryByQuestionType(t *testing.T) {
	files := fstest.MapFS{
		"data/mock-exam.json":  &fstest.MapFile{Data: []byte(`{"6":{"characters":[{"hanja":"人"},{"hanja":"口"},{"hanja":"學"}],"format":{"sections":[{"type":"sentenceSound","readingContext":{"kind":"sentence","wordLength":2,"minCharacters":15,"maxCharacters":55}},{"type":"passageMeaning","readingContext":{"kind":"passage","wordLength":3,"minCharacters":80,"maxCharacters":200}}]}}}`)},
		"data/vocabulary.json": &fstest.MapFile{Data: []byte(`[["人口","인구",[],["사람 수"],0,1],["人口學","인구학",[],["인구에 관한 학문"],0,1]]`)},
	}
	service, err := newSentenceService(files, sentenceOptions{apiKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	grade := service.grades["6"]
	if len(grade.types["sentenceSound"].words) != 1 || len(grade.types["passageMeaning"].words) != 1 || grade.types["passageMeaning"].context.Kind != "passage" {
		t.Fatalf("types = %+v", grade.types)
	}
	if !validGeneratedText(strings.Repeat("이 문장은 길게 이어집니다. ", 6)+"人口學을 배웁니다.\n마지막 문장입니다.", grade.types["passageMeaning"].words["人口學"], grade.types["passageMeaning"].context) {
		t.Fatal("passage should allow longer text and line breaks")
	}
}
