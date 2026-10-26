package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTopikGeneratesSelectedPart(t *testing.T) {
	question := topikQuestion{Instruction: "빈칸에 들어갈 말을 고르십시오.", Prompt: []string{"친구를 만나러 가는 길에 비가 (   ) 우산을 샀습니다."}, Choices: []string{"오니까", "오려고", "오더라도", "온 대신"}, Answer: 1, Explanation: "목적을 나타내는 표현입니다."}
	generated := topikGenerated{Questions: []topikQuestion{question}}
	calls := 0
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if calls == 1 && !strings.Contains(payload["input"].(string), "1~1번") {
			t.Errorf("missing selected part: %v", payload["input"])
		}
		var encoded []byte
		if calls == 1 {
			encoded, _ = json.Marshal(generated)
		} else {
			encoded, _ = json.Marshal(map[string]any{"questions": []any{
				map[string]any{"valid": true, "answer": 1, "fitting": []int{1}, "evidence": "목적", "wrongReasons": []string{"시제", "목적", "양보", "대조"}},
			}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(encoded)}}}}})
	}))
	defer openai.Close()
	server := &Server{topik: newTopikService(sentenceOptions{apiKey: "test", endpoint: openai.URL, client: openai.Client()})}
	request := httptest.NewRequest(http.MethodPost, "http://example.test/api/topik/generate", bytes.NewBufferString(`{"part":"grammar","unit":0}`))
	request.Header.Set("Origin", "http://example.test")
	response := httptest.NewRecorder()
	server.topikGenerate(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Questions []topikQuestion `json:"questions"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Questions) != 1 || result.Questions[0].Number != 1 {
		t.Fatalf("invalid numbered questions: %+v", result.Questions)
	}
	if calls != 2 {
		t.Fatalf("expected generation and review, got %d calls", calls)
	}
	noOrigin := httptest.NewRecorder()
	server.topikGenerate(noOrigin, httptest.NewRequest(http.MethodPost, "http://example.test/api/topik/generate", bytes.NewBufferString(`{"part":"grammar"}`)))
	if noOrigin.Code != http.StatusForbidden {
		t.Fatalf("missing origin accepted: %d", noOrigin.Code)
	}
}

func TestTopikRejectsBrokenSharedPassage(t *testing.T) {
	part := topikParts[6]
	questions := make([]topikQuestion, 6)
	for i := range questions {
		questions[i] = topikQuestion{Instruction: "읽으십시오", Shared: []string{strings.Repeat("학생들이 함께 도서관에 갔다. 책을 읽고 돌아왔다. ", 6)}, Prompt: []string{"내용과 같은 것을 고르십시오."}, Choices: []string{"첫째 보기", "둘째 보기", "셋째 보기", "넷째 보기"}, Answer: 0, Explanation: "지문에 근거함"}
	}
	questions[1].Shared = []string{strings.Repeat("다른 지문을 읽었다. 학생은 혼자 집으로 돌아왔다. ", 6)}
	if got := validateTopikQuestions(part, questions); got != "공통 지문이 다름" {
		t.Fatalf("unexpected validation: %s", got)
	}
}

func TestTopikReviewCorrectsIncorrectAnswerIndex(t *testing.T) {
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(payload["input"].(string), "explanation") || strings.Contains(payload["input"].(string), "answer") {
			t.Error("reviewer saw the generated answer")
		}
		answer, _ := json.Marshal(map[string]any{"questions": []any{map[string]any{"valid": true, "answer": 2, "fitting": []int{2}, "evidence": "독립 판정", "wrongReasons": []string{"틀림", "틀림", "정답", "틀림"}}}})
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{map[string]any{"content": []any{map[string]string{"type": "output_text", "text": string(answer)}}}}})
	}))
	defer openai.Close()
	service := newTopikService(sentenceOptions{apiKey: "test", endpoint: openai.URL, client: openai.Client()})
	question := topikQuestion{Shared: []string{}, Prompt: []string{"문장을 읽으십시오"}, Choices: []string{"첫째", "둘째", "셋째", "넷째"}, Answer: 1, Explanation: "생성자의 해설"}
	questions := []topikQuestion{question}
	reason, err := service.review(httptest.NewRequest(http.MethodPost, "/api/topik/generate", nil), questions)
	if err != nil || reason != "" {
		t.Fatalf("review failed: reason=%q err=%v", reason, err)
	}
	if questions[0].Answer != 2 || questions[0].Explanation != "독립 판정" {
		t.Fatalf("review correction missing: %+v", questions[0])
	}
}

func TestTopikRejectsRepeatedWordAroundBlank(t *testing.T) {
	question := topikQuestion{Instruction: "빈칸에 들어갈 말을 고르십시오.", Prompt: []string{"창문을 닫아 (   ) 방이 따뜻해졌다."}, Choices: []string{"닫아 두어서", "닫아 보니까", "닫아 두려면", "닫아 보아도"}, Answer: 0, Explanation: "결과를 나타낸다"}
	if got := validateTopikQuestions(topikParts[0], []topikQuestion{question, question}); !strings.Contains(got, "반복") {
		t.Fatalf("repeated word accepted: %s", got)
	}
}

func TestTopikPartsCoverReadingPaperAndUnits(t *testing.T) {
	response := httptest.NewRecorder()
	(&Server{}).topikParts(response, httptest.NewRequest(http.MethodGet, "/api/topik/parts", nil))
	var listed []struct {
		ID    string `json:"id"`
		Units []int  `json:"units"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed) != len(topikParts) {
		t.Fatalf("listed %d parts, want %d", len(listed), len(topikParts))
	}
	next := 1
	for i, part := range topikParts {
		if part.Start != next || part.End < part.Start {
			t.Fatalf("part gap or overlap at %s", part.ID)
		}
		if listed[i].ID != part.ID || len(listed[i].Units) != len(topikUnitSizes(part)) {
			t.Fatalf("incorrect units for %s: %+v", part.ID, listed[i])
		}
		count := 0
		for _, size := range listed[i].Units {
			count += size
		}
		if count != part.End-part.Start+1 {
			t.Fatalf("units do not cover %s", part.ID)
		}
		if len(part.Pairing) > 0 {
			count = 0
			for _, size := range part.Pairing {
				if size < 2 {
					t.Fatalf("invalid shared unit in %s", part.ID)
				}
				count += size
			}
			if count != part.End-part.Start+1 {
				t.Fatalf("shared units do not cover %s", part.ID)
			}
		}
		next = part.End + 1
	}
	if next != 51 {
		t.Fatalf("reading blueprint ended at %d", next-1)
	}
}
