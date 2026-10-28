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

func TestSentenceAllScopeAcceptsWordsOutsideSelectedLevel(t *testing.T) {
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{})
	if err != nil {
		t.Fatal(err)
	}
	grade := service.grades["8"]
	var outside string
	for hanja := range grade.allTypes["sentenceSound"].words {
		if _, inLevel := grade.types["sentenceSound"].words[hanja]; !inLevel {
			outside = hanja
			break
		}
	}
	if outside == "" {
		t.Fatal("all-level pool has no extra word")
	}
	server := &Server{sentences: service}
	manifest := httptest.NewRecorder()
	server.sentenceManifest(manifest, httptest.NewRequest(http.MethodGet, "/api/mock-exam/sentences?level=8&scope=all", nil))
	if manifest.Code != http.StatusOK || !strings.Contains(manifest.Body.String(), outside) {
		t.Fatalf("all-scope manifest: %d", manifest.Code)
	}
	request := func(scope string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"level": "8", "scope": scope, "type": "sentenceSound", "hanja": outside})
		recorder := httptest.NewRecorder()
		server.sentence(recorder, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewReader(body)))
		return recorder
	}
	if got := request("level"); got.Code != http.StatusBadRequest {
		t.Fatalf("level-only accepted extra word: %d", got.Code)
	}
	if got := request("all"); got.Code != http.StatusServiceUnavailable || !strings.Contains(got.Body.String(), "OpenAI API key") {
		t.Fatalf("all-scope did not accept extra word: %d %s", got.Code, got.Body.String())
	}
}

func TestSentenceRequiresServerKey(t *testing.T) {
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	manifest := httptest.NewRecorder()
	server.sentenceManifest(manifest, httptest.NewRequest(http.MethodGet, "/api/mock-exam/sentences?level=8", nil))
	if manifest.Code != http.StatusOK || !strings.Contains(manifest.Body.String(), `"generationEnabled":false`) {
		t.Fatalf("manifest: %d %s", manifest.Code, manifest.Body.String())
	}
	response := httptest.NewRecorder()
	server.sentence(response, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"8","type":"sentenceSound","hanja":"人口"}`)))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("without key: %d %s", response.Code, response.Body.String())
	}
}

func TestPairedPassageUsesGradePools(t *testing.T) {
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(payload["input"].(string), "家族") || !strings.Contains(payload["input"].(string), "人") {
			t.Error("missing paired targets")
		}
		text := strings.Repeat("가족이 함께 식사를 준비했다. ", 5) + "㉠가족은 음식을 나누었다. 그 뒤 ㉡사람을 만나 함께 집으로 돌아왔다."
		if calls == 1 {
			text = "잘못된 글"
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
	if len(service.grades["6"].types["passage"].words) <= 8 || len(service.grades["6"].characters) <= 8 {
		t.Fatal("paired passage did not load the grade-wide target pools")
	}
	manifest := httptest.NewRecorder()
	server.sentenceManifest(manifest, httptest.NewRequest(http.MethodGet, "/api/mock-exam/sentences?level=6", nil))
	if manifest.Code != http.StatusOK || !strings.Contains(manifest.Body.String(), `"passageCharacters"`) || !strings.Contains(manifest.Body.String(), "家族") {
		t.Fatalf("passage manifest: %d %s", manifest.Code, manifest.Body.String())
	}
	bad := httptest.NewRecorder()
	server.passage(bad, httptest.NewRequest(http.MethodPost, "/api/mock-exam/passage", bytes.NewBufferString(`{"level":"6","word":"家族","character":"齒"}`)))
	if bad.Code != http.StatusBadRequest || calls != 0 {
		t.Fatalf("invalid character: %d calls=%d", bad.Code, calls)
	}
	response := httptest.NewRecorder()
	server.passage(response, httptest.NewRequest(http.MethodPost, "/api/mock-exam/passage", bytes.NewBufferString(`{"level":"6","word":"家族","character":"人"}`)))
	if response.Code != http.StatusOK || calls != 2 || !strings.Contains(response.Body.String(), `"source":"ChatGPT"`) {
		t.Fatalf("paired passage: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestPairedPassageRepairsMarkersAndLengthForExamStructure(t *testing.T) {
	const draft = "학생들은 학교 텃밭에 물을 공급하는 장치를 만들었다. 먼저 작은 통에 물을 담고 관을 연결한 뒤, 일정한 속도로 흙에 [[A]]했다. 며칠 뒤에는 나무가 자라는 모습을 살펴보았다. 가을에는 가지마다 열린 [[B]]를 따서 친구들과 함께 나누어 먹었다."
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		input := payload["input"].(string)
		if !strings.Contains(input, "㉠주입") || !strings.Contains(input, "㉡실과") || !strings.Contains(input, "[[A]]") || !strings.Contains(input, "[[B]]") {
			t.Errorf("missing exact exam markers or placeholders: %s", input)
		}
		answer := draft
		if calls == 1 {
			answer = "[[A]]했다. [[B]]가 있었다."
		} else if !strings.Contains(input, "이전 응답의 문제: 길이") {
			t.Error("retry did not explain the rejected length")
		}
		encoded, _ := json.Marshal(map[string]string{"text": answer})
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(encoded)}}}}})
	}))
	defer openai.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{apiKey: "test-key", endpoint: openai.URL, client: openai.Client()})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	response := httptest.NewRecorder()
	server.passage(response, httptest.NewRequest(http.MethodPost, "/api/mock-exam/passage", bytes.NewBufferString(`{"level":"6","word":"注入","character":"果"}`)))
	if response.Code != http.StatusOK || calls != 2 {
		t.Fatalf("paired passage: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.Text, "㉠주입했다") || !strings.Contains(result.Text, "㉡실과를") || strings.Contains(result.Text, "[[A]]") {
		t.Fatalf("unexpected exam passage: %q", result.Text)
	}
	target := passageTarget{word: examWord{reading: "주입"}, characterText: "실과", context: readingContext{MinCharacters: 100, MaxCharacters: 300}}
	if _, reason := validatePairedPassage(strings.ReplaceAll(result.Text, "㉠주입", "㉠ 주입"), target); reason != "" {
		t.Fatalf("harmless marker spacing rejected: %s", reason)
	}
	longPassage := "학생들은 텃밭에 물을 ㉠주입했다. " + strings.Repeat("그날 학생들은 서로 도우며 텃밭의 변화를 살펴보았다. ", 7) + "며칠 뒤에는 ㉡실과를 따서 함께 나누어 먹었다."
	if _, reason := validatePairedPassage(longPassage, target); reason != "" {
		t.Fatalf("source-length passage rejected: %s", reason)
	}
}

func TestSentenceReportsGenerationError(t *testing.T) {
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
	if response.Code != http.StatusServiceUnavailable || calls != 1 {
		t.Fatalf("generation error: %d calls=%d %s", response.Code, calls, response.Body.String())
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

func TestBlankContextRequiresOnePlaceholderAndNoAnswerLeak(t *testing.T) {
	word := examWord{hanja: "人口", reading: "인구", meaning: "사람 수"}
	context := readingContext{Kind: "blank", WordLength: 2, MinCharacters: 15, MaxCharacters: 55}
	if !validGeneratedText("이 도시의 □□는 해마다 늘고 있다.", word, context) {
		t.Fatal("valid blank rejected")
	}
	for _, value := range []string{"이 도시의 人口는 해마다 늘고 있다.", "이 도시의 인구는 해마다 늘고 있다.", "이 도시의 □□와 □□를 살핀다.", "이 도시의 □□□는 해마다 늘고 있다."} {
		if validGeneratedText(value, word, context) {
			t.Fatalf("invalid blank accepted: %q", value)
		}
	}
}

func TestBlankChoicesRejectAmbiguityAndSendDefinitions(t *testing.T) {
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		input := payload["input"].(string)
		if !strings.Contains(input, `"hanja":"南東"`) || !strings.Contains(input, "남쪽과 동쪽 사이의 방향") {
			t.Errorf("option definitions missing from prompt: %s", input)
		}
		fitting := []string{"東南", "南東"}
		if calls == 2 {
			fitting = []string{"東南"}
		}
		encoded, _ := json.Marshal(map[string]any{"text": "태풍이 섬의 □□ 해안으로 다가왔다.", "fitting": fitting})
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(encoded)}}}}})
	}))
	defer openai.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{apiKey: "test-key", endpoint: openai.URL, client: openai.Client()})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service}
	body := `{"level":"7","type":"sentenceBlank","hanja":"東南","choices":["東南","南東","東洋","東北","北東"]}`
	first := httptest.NewRecorder()
	server.sentence(first, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(body)))
	if first.Code != http.StatusConflict || !strings.Contains(first.Body.String(), `"南東"`) || calls != 1 {
		t.Fatalf("ambiguous: %d calls=%d %s", first.Code, calls, first.Body.String())
	}
	second := httptest.NewRecorder()
	server.sentence(second, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(body)))
	if second.Code != http.StatusOK || !strings.Contains(second.Body.String(), `"source":"ChatGPT"`) || calls != 2 {
		t.Fatalf("unique: %d calls=%d %s", second.Code, calls, second.Body.String())
	}
	invalid := httptest.NewRecorder()
	server.sentence(invalid, httptest.NewRequest(http.MethodPost, "/api/mock-exam/sentence", bytes.NewBufferString(`{"level":"7","type":"sentenceBlank","hanja":"東南","choices":["東南","東南","東洋","東北","北東"]}`)))
	if invalid.Code != http.StatusBadRequest || calls != 2 {
		t.Fatalf("invalid options: %d calls=%d", invalid.Code, calls)
	}
}
