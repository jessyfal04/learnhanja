package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

type topikPart struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
	Median  int    `json:"medianCharacters"`
	Guide   string `json:"-"`
	Pairing []int  `json:"-"`
}

var topikParts = []topikPart{
	{"grammar", "문법 · 빈칸", 1, 2, 56, "문장 하나의 빈칸에 문법 표현을 넣는 문제", nil},
	{"expression", "비슷한 표현", 3, 4, 31, "밑줄 친 표현과 문맥상 의미가 가장 비슷한 표현을 고르는 문제", nil},
	{"notice", "광고·안내문", 5, 8, 53, "짧은 광고나 안내문의 목적 또는 내용을 파악하는 문제", nil},
	{"information", "정보 일치", 9, 12, 178, "공지, 표의 수치, 설명문에서 사실과 일치하는 보기를 고르는 문제. 표는 텍스트로 표현", nil},
	{"ordering", "문장 순서", 13, 15, 177, "(가)(나)(다)(라) 네 문장을 논리적으로 배열하는 문제. 보기는 네 가지 순서", nil},
	{"short_blank", "짧은 글 빈칸", 16, 18, 192, "짧은 단락의 빈칸에 들어갈 연결 표현이나 핵심 문장을 고르는 문제", nil},
	{"paired", "두 문항 공통 지문", 19, 24, 261, "각 지문에 서로 다른 이해 질문 두 개를 붙이는 문제", []int{2, 2, 2}},
	{"headline", "신문 제목", 25, 27, 60, "자연스러운 한국어 기사 제목을 읽고 그 뜻을 고르는 문제", nil},
	{"inference", "내용 추론·빈칸", 28, 31, 206, "중간 길이 설명·주장문을 읽고 추론하거나 빈칸을 채우는 문제", nil},
	{"matching", "내용 일치", 32, 34, 234, "글의 세부 사실과 일치하는 보기를 고르는 문제", nil},
	{"main_idea", "중심 생각", 35, 38, 229, "글의 핵심 주장 또는 주제를 고르는 문제", nil},
	{"insertion", "문장 넣기", 39, 41, 294, "지문의 ㉠㉡㉢㉣ 네 위치 중 제시 문장이 들어갈 곳을 고르는 문제", nil},
	{"long", "긴 글 이해", 42, 50, 476, "긴 문학·비문학 지문과 태도·목적·추론·내용 일치 문제", []int{2, 2, 2, 3}},
}

type topikQuestion struct {
	Number      int      `json:"number"`
	Instruction string   `json:"instruction"`
	Shared      []string `json:"shared"`
	Prompt      []string `json:"prompt"`
	Choices     []string `json:"choices"`
	Answer      int      `json:"answer"`
	Explanation string   `json:"explanation"`
	Images      []string `json:"images"`
}

type topikGenerated struct {
	Questions []topikQuestion `json:"questions"`
}

type topikReview struct {
	Questions []struct {
		Valid        bool     `json:"valid"`
		Answer       int      `json:"answer"`
		Fitting      []int    `json:"fitting"`
		Evidence     string   `json:"evidence"`
		WrongReasons []string `json:"wrongReasons"`
	} `json:"questions"`
}

type topikService struct {
	model    *sentenceService
	mu       sync.Mutex
	requests map[string][]time.Time
	global   []time.Time
}

func newTopikService(options sentenceOptions) *topikService {
	if options.model == "" {
		options.model = "gpt-6-luna"
	}
	if options.endpoint == "" {
		options.endpoint = defaultResponsesURL
	}
	if options.client == nil {
		options.client = http.DefaultClient
	}
	return &topikService{model: &sentenceService{options: options}, requests: make(map[string][]time.Time)}
}

func (service *topikService) allow(client string, now time.Time) bool {
	service.mu.Lock()
	defer service.mu.Unlock()
	valid := service.requests[client][:0]
	for _, when := range service.requests[client] {
		if when.After(now.Add(-time.Hour)) {
			valid = append(valid, when)
		}
	}
	daily := service.global[:0]
	for _, when := range service.global {
		if when.After(now.Add(-24 * time.Hour)) {
			daily = append(daily, when)
		}
	}
	service.global = daily
	if len(valid) >= 20 || len(daily) >= 80 {
		service.requests[client] = valid
		return false
	}
	service.requests[client] = append(valid, now)
	service.global = append(daily, now)
	return true
}

func (s *Server) topikParts(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	type listedPart struct {
		topikPart
		Units []int `json:"units"`
	}
	listed := make([]listedPart, len(topikParts))
	for i, part := range topikParts {
		listed[i] = listedPart{topikPart: part, Units: topikUnitSizes(part)}
	}
	_ = json.NewEncoder(w).Encode(listed)
}

func topikUnitSizes(part topikPart) []int {
	if len(part.Pairing) > 0 {
		return part.Pairing
	}
	units := make([]int, part.End-part.Start+1)
	for i := range units {
		units[i] = 1
	}
	return units
}

func (s *Server) topikGenerate(w http.ResponseWriter, r *http.Request) {
	if s.topik == nil || s.topik.model.options.apiKey == "" {
		http.Error(w, "TOPIK AI generation is unavailable", http.StatusServiceUnavailable)
		return
	}
	origin := r.Header.Get("Origin")
	parsed, originErr := url.Parse(origin)
	if origin == "" || originErr != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") || (r.Header.Get("Sec-Fetch-Site") != "" && r.Header.Get("Sec-Fetch-Site") != "same-origin") {
		http.Error(w, "same-origin request required", http.StatusForbidden)
		return
	}
	var request struct {
		Part string `json:"part"`
		Unit *int   `json:"unit"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(new(any)) != io.EOF {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	var part *topikPart
	for i := range topikParts {
		if topikParts[i].ID == request.Part {
			part = &topikParts[i]
			break
		}
	}
	if part == nil {
		http.Error(w, "unknown TOPIK part", http.StatusBadRequest)
		return
	}
	units := topikUnitSizes(*part)
	if request.Unit == nil || *request.Unit < 0 || *request.Unit >= len(units) {
		http.Error(w, "select a TOPIK question unit", http.StatusBadRequest)
		return
	}
	selected := *part
	selected.Start = part.Start
	for _, size := range units[:*request.Unit] {
		selected.Start += size
	}
	selected.End = selected.Start + units[*request.Unit] - 1
	if units[*request.Unit] > 1 {
		selected.Pairing = []int{units[*request.Unit]}
	} else {
		selected.Pairing = nil
	}
	if part.ID == "paired" {
		selected.Median = []int{252, 244, 442}[*request.Unit]
	}
	if part.ID == "long" {
		selected.Median = []int{584, 419, 452, 518}[*request.Unit]
	}
	client, _, splitErr := net.SplitHostPort(r.RemoteAddr)
	if splitErr != nil {
		client = r.RemoteAddr
	}
	if !s.topik.allow(client, time.Now()) {
		http.Error(w, "TOPIK generation limit reached", http.StatusTooManyRequests)
		return
	}
	questions, err := s.topik.generate(r, selected)
	if err != nil {
		http.Error(w, "TOPIK questions could not be validated: "+err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"id": "ai-" + part.ID, "title": "AI 연습 · " + part.Label, "part": part.ID, "questions": questions})
}

func (service *topikService) generate(r *http.Request, part topikPart) ([]topikQuestion, error) {
	questionSchema := map[string]any{"type": "object", "properties": map[string]any{
		"instruction": map[string]any{"type": "string"}, "shared": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"prompt": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}, "choices": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"answer": map[string]any{"type": "integer"}, "explanation": map[string]any{"type": "string"},
	}, "required": []string{"instruction", "shared", "prompt", "choices", "answer", "explanation"}, "additionalProperties": false}
	schema := map[string]any{"type": "object", "properties": map[string]any{"questions": map[string]any{"type": "array", "items": questionSchema}}, "required": []string{"questions"}, "additionalProperties": false}
	instructions := "TOPIK II PBT 읽기 유형에 맞는 완전히 새로운 한국어 문제를 만드세요. 기출 지문의 문장, 고유명사, 보기, 정답을 복제하지 마세요. 네 보기는 모두 그럴듯해야 하지만 정답은 하나여야 합니다. 본문을 먼저 정하고 질문과 보기를 만드세요. 빈칸 문제는 네 보기를 각각 넣어 문장 전체를 읽으세요. 빈칸 직전 단어와 보기 첫 단어가 중복되어서는 안 됩니다. 각 문항의 explanation에는 지문 근거와 나머지 보기의 오류를 간결하게 설명하세요. shared는 공통 지문 단락 배열, prompt는 그 문항만의 질문·자료 단락 배열입니다. 한 지문을 공유하는 문항들은 shared 배열을 정확히 동일하게 쓰세요. answer는 0=첫 번째, 1=두 번째, 2=세 번째, 3=네 번째 보기입니다. images와 number는 반환하지 마세요."
	input := fmt.Sprintf("파트: %s (%d~%d번), 총 %d문항\n유형: %s\n기출 EPUB의 해당 위치에서 지문+질문 중앙 길이: 약 %d자. 각 문항의 shared+prompt 합계를 이 길이의 60~140%% 안에서 작성하세요.\n배열의 순서가 실제 문항 순서입니다. 선택지는 정답 포함 정확히 네 개, answer는 0~3 정수입니다. 다른 문항과 주제·정답 보기를 반복하지 마세요.", part.Label, part.Start, part.End, part.End-part.Start+1, part.Guide, part.Median)
	if part.ID == "grammar" {
		input += "\n문법 문장의 빈칸은 prompt의 문장 안에 ASCII 괄호로 정확히 (   )라고 쓰세요. □, 밑줄, 꺾쇠 또는 shared의 빈칸으로 대신하지 마세요."
	}
	if len(part.Pairing) > 0 {
		input += fmt.Sprintf("\n공통 지문 묶음 크기: %v. 각 묶음은 서로 다른 새 지문을 쓰고, 묶음 안 문항은 동일한 shared 배열을 쓰세요.", part.Pairing)
	}
	if part.ID == "insertion" {
		input += "\n각 지문에 ㉠ ㉡ ㉢ ㉣을 각각 정확히 한 번 넣고 prompt에 삽입할 문장을 넣으세요. 보기는 ㉠, ㉡, ㉢, ㉣입니다."
	}
	var reason string
	for attempt := 0; attempt < 3; attempt++ {
		var generated topikGenerated
		if err := service.model.requestStructured(r.Context(), instructions, input, schema, 800+(part.End-part.Start+1)*650, &generated); err != nil {
			return nil, err
		}
		reason = validateTopikQuestions(part, generated.Questions)
		if reason != "" {
			log.Printf("TOPIK candidate rejected part=%s attempt=%d reason=%s", part.ID, attempt+1, reason)
		}
		if reason == "" {
			var reviewErr error
			reason, reviewErr = service.review(r, generated.Questions)
			if reviewErr != nil {
				return nil, reviewErr
			}
		}
		if reason == "" {
			for i := range generated.Questions {
				generated.Questions[i].Number = part.Start + i
				generated.Questions[i].Images = []string{}
			}
			return generated.Questions, nil
		}
		input += "\n이전 출력의 검증 오류: " + reason + ". 새로운 문제 묶음을 처음부터 작성하세요."
	}
	return nil, fmt.Errorf("%s", reason)
}

func (service *topikService) review(r *http.Request, questions []topikQuestion) (string, error) {
	type reviewInput struct {
		Shared  []string `json:"shared"`
		Prompt  []string `json:"prompt"`
		Choices []string `json:"choices"`
	}
	inputQuestions := make([]reviewInput, len(questions))
	for i, question := range questions {
		inputQuestions[i] = reviewInput{question.Shared, question.Prompt, question.Choices}
	}
	encoded, _ := json.Marshal(inputQuestions)
	reviewItem := map[string]any{"type": "object", "properties": map[string]any{
		"valid": map[string]any{"type": "boolean"}, "answer": map[string]any{"type": "integer"}, "fitting": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}},
		"evidence": map[string]any{"type": "string"}, "wrongReasons": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
	}, "required": []string{"valid", "answer", "fitting", "evidence", "wrongReasons"}, "additionalProperties": false}
	schema := map[string]any{"type": "object", "properties": map[string]any{"questions": map[string]any{"type": "array", "items": reviewItem}}, "required": []string{"questions"}, "additionalProperties": false}
	instructions := "당신은 TOPIK II 읽기 문제의 독립 검토자입니다. 생성자의 정답과 해설은 제공되지 않습니다. 각 지문과 네 보기를 독립적으로 읽고 판정하세요. 빈칸 문제는 보기 하나씩 실제 빈칸에 대입하고 전체 문장에 문법·의미상 들어갈 수 있는 보기 번호를 모두 fitting에 넣으세요. 다른 유형도 지문에 근거해 방어 가능한 보기를 모두 fitting에 넣으세요. fitting 길이가 정확히 1일 때만 valid가 true입니다. 문장에 반복·비문이 있거나 난도가 부자연스러우면 valid=false입니다. answer는 0=첫 번째, 1=두 번째, 2=세 번째, 3=네 번째 보기입니다. evidence에 선택 근거, wrongReasons에 네 보기 각각의 판정 근거를 배열 순서대로 적으세요. 정답 보기에도 정답인 이유를 적으세요."
	var reviewed topikReview
	if err := service.model.requestStructured(r.Context(), instructions, string(encoded), schema, 500+len(questions)*500, &reviewed); err != nil {
		return "", err
	}
	if len(reviewed.Questions) != len(questions) {
		return "검토 문항 수가 다름", nil
	}
	for i, result := range reviewed.Questions {
		if !result.Valid || len(result.Fitting) != 1 || result.Fitting[0] != result.Answer || result.Answer < 0 || result.Answer > 3 || strings.TrimSpace(result.Evidence) == "" || len(result.WrongReasons) != 4 {
			return fmt.Sprintf("%d번째 문항 정답 또는 유일성 검토 불일치", i+1), nil
		}
		for _, reason := range result.WrongReasons {
			if strings.TrimSpace(reason) == "" {
				return fmt.Sprintf("%d번째 문항 보기 검토 누락", i+1), nil
			}
		}
		questions[i].Answer = result.Answer
		questions[i].Explanation = result.Evidence
	}
	return "", nil
}

func validateTopikQuestions(part topikPart, questions []topikQuestion) string {
	if len(questions) != part.End-part.Start+1 {
		return "문항 수가 다름"
	}
	for i, question := range questions {
		if len(question.Choices) != 4 || question.Answer < 0 || question.Answer > 3 {
			return fmt.Sprintf("%d번 보기/정답 형식", part.Start+i)
		}
		if strings.TrimSpace(question.Instruction) == "" || strings.TrimSpace(question.Explanation) == "" || len(question.Prompt) == 0 {
			return fmt.Sprintf("%d번 질문 또는 해설 누락", part.Start+i)
		}
		seen := make(map[string]bool)
		for _, choice := range question.Choices {
			cleaned := strings.Join(strings.Fields(choice), "")
			if utf8.RuneCountInString(cleaned) < 2 || seen[cleaned] {
				return fmt.Sprintf("%d번 보기 중복/누락", part.Start+i)
			}
			seen[cleaned] = true
		}
		body := strings.Join(append(append([]string{}, question.Shared...), question.Prompt...), " ")
		if part.ID == "grammar" {
			prompt := strings.Join(question.Prompt, " ")
			blank := strings.Index(prompt, "(")
			if blank < 0 || !strings.Contains(prompt[blank:], ")") {
				return fmt.Sprintf("%d번 빈칸 누락", part.Start+i)
			}
			before := strings.Fields(prompt[:blank])
			if len(before) > 0 {
				previous := strings.Trim(before[len(before)-1], " ,.;:!?\"'…")
				for _, choice := range question.Choices {
					first := strings.Fields(choice)
					if len(first) > 0 && previous == strings.Trim(first[0], " ,.;:!?\"'…") {
						return fmt.Sprintf("%d번 빈칸 앞 단어 반복", part.Start+i)
					}
				}
			}
		}
		minimum := max(15, part.Median/3)
		if len(part.Pairing) > 0 {
			minimum = part.Median * 60 / 100
		}
		if utf8.RuneCountInString(body) < minimum || utf8.RuneCountInString(body) > max(180, part.Median*2) {
			return fmt.Sprintf("%d번 지문 길이", part.Start+i)
		}
		if !strings.ContainsFunc(body, func(r rune) bool { return unicode.Is(unicode.Hangul, r) }) {
			return fmt.Sprintf("%d번 한국어 지문 누락", part.Start+i)
		}
		if part.ID == "insertion" {
			for _, marker := range []string{"㉠", "㉡", "㉢", "㉣"} {
				if strings.Count(strings.Join(question.Shared, " "), marker) != 1 {
					return fmt.Sprintf("%d번 삽입 위치", part.Start+i)
				}
			}
		}
	}
	if len(part.Pairing) > 0 {
		at := 0
		for _, size := range part.Pairing {
			if len(questions[at].Shared) == 0 {
				return "공통 지문 누락"
			}
			first, _ := json.Marshal(questions[at].Shared)
			for j := at + 1; j < at+size; j++ {
				next, _ := json.Marshal(questions[j].Shared)
				if string(first) != string(next) {
					return "공통 지문이 다름"
				}
			}
			at += size
		}
	}
	return ""
}
