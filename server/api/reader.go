package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

type readerWord struct {
	Hanja   string `json:"hanja"`
	Hangul  string `json:"hangul"`
	Meaning string `json:"meaning,omitempty"`
}

type readerSegment struct {
	Text  string `json:"text"`
	Hanja string `json:"hanja"`
}

type readerPassage struct {
	Segments []readerSegment `json:"segments"`
}

type readerRequest struct {
	Subject  string       `json:"subject"`
	Length   string       `json:"length"`
	Words    []readerWord `json:"words"`
	Familiar []string     `json:"familiar"`
	Avoid    []string     `json:"avoid"`
}

type readerService struct {
	options        sentenceOptions
	catalog        map[string]readerWord
	mu             sync.Mutex
	requests       map[string][]time.Time
	globalRequests []time.Time
}

func newReaderService(files fs.FS, options sentenceOptions) (*readerService, error) {
	data, err := fs.ReadFile(files, "data/vocabulary.json")
	if err != nil {
		return nil, err
	}
	var rows [][]json.RawMessage
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	catalog := make(map[string]readerWord)
	for _, row := range rows {
		if len(row) < 4 {
			continue
		}
		var hanja, hangul string
		var definitions []string
		if json.Unmarshal(row[0], &hanja) != nil || json.Unmarshal(row[1], &hangul) != nil || json.Unmarshal(row[3], &definitions) != nil {
			continue
		}
		if !onlyHangul(hangul) || strings.HasSuffix(hangul, "하다") || strings.HasSuffix(hangul, "되다") || utf8.RuneCountInString(hangul) < 2 || utf8.RuneCountInString(hangul) > 4 || utf8.RuneCountInString(hangul) != utf8.RuneCountInString(hanja) {
			continue
		}
		validHanja := true
		for _, character := range hanja {
			if !unicode.Is(unicode.Han, character) {
				validHanja = false
				break
			}
		}
		if !validHanja {
			continue
		}
		meaning := ""
		for _, definition := range definitions {
			if strings.TrimSpace(definition) != "" {
				meaning = strings.TrimSpace(definition)
				break
			}
		}
		if meaning == "" {
			continue
		}
		catalog[hangul+"\x00"+hanja] = readerWord{Hanja: hanja, Hangul: hangul, Meaning: meaning}
	}
	if options.endpoint == "" {
		options.endpoint = defaultResponsesURL
	}
	if options.model == "" {
		options.model = "gpt-6-luna"
	}
	if options.client == nil {
		options.client = http.DefaultClient
	}
	return &readerService{options: options, catalog: catalog, requests: make(map[string][]time.Time)}, nil
}

func readerBounds(length string) (int, int, bool) {
	switch length {
	case "short":
		return 100, 200, true
	case "medium":
		return 300, 500, true
	case "long":
		return 600, 1000, true
	default:
		return 0, 0, false
	}
}

func (service *readerService) validateRequest(req readerRequest) (map[string]readerWord, error) {
	if len(req.Subject) > 100 || strings.TrimSpace(req.Subject) == "" || len(req.Words) < 3 || len(req.Words) > 40 || len(req.Familiar) > 35 || len(req.Avoid) > 8 {
		return nil, errors.New("주제 또는 어휘 목록이 올바르지 않습니다")
	}
	if _, _, ok := readerBounds(req.Length); !ok {
		return nil, errors.New("길이가 올바르지 않습니다")
	}
	allowed := make(map[string]readerWord)
	for _, word := range req.Words {
		key := word.Hangul + "\x00" + word.Hanja
		entry, ok := service.catalog[key]
		if !ok {
			return nil, errors.New("사전에 없는 한자어가 포함되었습니다")
		}
		allowed[key] = entry
	}
	for _, word := range append(req.Familiar, req.Avoid...) {
		if utf8.RuneCountInString(word) > 30 {
			return nil, errors.New("어휘가 너무 깁니다")
		}
	}
	return allowed, nil
}

func validateReaderPassage(p readerPassage, length string, allowed map[string]readerWord) error {
	minLength, maxLength, ok := readerBounds(length)
	if !ok || len(p.Segments) < 2 || len(p.Segments) > 200 {
		return errors.New("지문 구조가 올바르지 않습니다")
	}
	var text strings.Builder
	used := make(map[string]bool)
	for _, segment := range p.Segments {
		if segment.Text == "" || strings.ContainsRune(segment.Text, '\r') {
			return errors.New("빈 구간 또는 잘못된 줄바꿈")
		}
		for _, symbol := range segment.Text {
			if unicode.Is(unicode.Han, symbol) {
				return errors.New("본문에 한자가 포함되었습니다")
			}
		}
		if segment.Hanja != "" {
			key := segment.Text + "\x00" + segment.Hanja
			if _, found := allowed[key]; !found {
				return errors.New("허용하지 않은 한자어 또는 독음")
			}
			used[key] = true
		}
		text.WriteString(segment.Text)
	}
	if n := utf8.RuneCountInString(text.String()); n < minLength || n > maxLength {
		return fmt.Errorf("지문 길이 %d자: %d~%d자 필요", n, minLength, maxLength)
	}
	if len(used) < min(3, len(allowed)) {
		return errors.New("목표 어휘가 부족합니다")
	}
	return nil
}

func (service *readerService) allow(client string, now time.Time) bool {
	service.mu.Lock()
	defer service.mu.Unlock()
	cutoff := now.Add(-time.Hour)
	valid := service.requests[client][:0]
	for _, when := range service.requests[client] {
		if when.After(cutoff) {
			valid = append(valid, when)
		}
	}
	daily := service.globalRequests[:0]
	for _, when := range service.globalRequests {
		if when.After(now.Add(-24 * time.Hour)) {
			daily = append(daily, when)
		}
	}
	service.globalRequests = daily
	if len(valid) >= 20 || len(daily) >= 60 {
		service.requests[client] = valid
		return false
	}
	service.requests[client] = append(valid, now)
	service.globalRequests = append(daily, now)
	return true
}

func (s *Server) readerGenerate(w http.ResponseWriter, r *http.Request) {
	if s.reader == nil || s.reader.options.apiKey == "" {
		http.Error(w, "AI 읽기가 설정되지 않았습니다. 서버의 OPENAI_API_KEY를 확인하세요", http.StatusServiceUnavailable)
		return
	}
	origin := r.Header.Get("Origin")
	parsed, originErr := url.Parse(origin)
	if origin == "" || originErr != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") || (r.Header.Get("Sec-Fetch-Site") != "" && r.Header.Get("Sec-Fetch-Site") != "same-origin") {
		http.Error(w, "같은 사이트에서 요청하세요", http.StatusForbidden)
		return
	}
	var req readerRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 12000))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "요청 크기 또는 형식이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		http.Error(w, "요청 형식이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	allowed, err := s.reader.validateRequest(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	client, _, splitErr := net.SplitHostPort(r.RemoteAddr)
	if splitErr != nil {
		client = r.RemoteAddr
	}
	if !s.reader.allow(client, time.Now()) {
		http.Error(w, "한 시간 생성 한도에 도달했습니다. 잠시 후 다시 시도하세요", http.StatusTooManyRequests)
		return
	}
	var passage readerPassage
	for attempt := 0; attempt < 3; attempt++ {
		passage, err = s.reader.generate(r.Context(), req, allowed)
		if err == nil {
			err = validateReaderPassage(passage, req.Length, allowed)
		}
		if err == nil {
			break
		}
	}
	if err != nil {
		http.Error(w, "자연스러운 지문을 확인하지 못했습니다. 주제나 목표 한자를 바꾸어 다시 시도하세요", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(passage)
}

func (service *readerService) generate(ctx context.Context, req readerRequest, allowed map[string]readerWord) (readerPassage, error) {
	minLength, maxLength, _ := readerBounds(req.Length)
	words := make([]readerWord, 0, len(allowed))
	for _, requestWord := range req.Words {
		words = append(words, allowed[requestWord.Hangul+"\x00"+requestWord.Hanja])
	}
	constraints, _ := json.Marshal(map[string]any{"subject": req.Subject, "length": fmt.Sprintf("%d~%d자, 공백 포함", minLength, maxLength), "target_words": words, "familiar_words": req.Familiar, "avoid_recent_words": req.Avoid})
	schema := map[string]any{"type": "object", "properties": map[string]any{"segments": map[string]any{"type": "array", "items": map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}, "hanja": map[string]any{"type": "string"}}, "required": []string{"text", "hanja"}, "additionalProperties": false}}}, "required": []string{"segments"}, "additionalProperties": false}
	payload := map[string]any{"model": service.options.model, "reasoning": map[string]string{"effort": "none"}, "instructions": "하나의 분명한 상황이나 생각을 이어 가는 자연스러운 현대 한국어 산문을 쓰세요. 목표 어휘는 문맥에 맞는 것만 고르고 적어도 세 개를 쓰세요. 모든 목표 어휘나 한자를 억지로 넣지 마세요. 익숙한 어휘를 주로 사용하고 같은 목표 어휘를 자연스러운 위치에서 다시 만나게 하세요. 본문은 한글로만 작성하고, 목표 단어를 사용한 정확한 위치만 별도 segment로 분리하세요. 그 segment의 text는 한글 독음, hanja는 제공된 사전 표기여야 합니다. 다른 모든 segment의 hanja는 빈 문자열입니다. 조사와 문장부호는 별도 일반 segment에 둡니다. 전체 segment의 text를 합치면 지문이 됩니다. 지시나 제목을 본문에 쓰지 마세요.", "input": string(constraints), "text": map[string]any{"format": map[string]any{"type": "json_schema", "name": "hanja_immersion_reader", "strict": true, "schema": schema}}, "max_output_tokens": maxLength * 7}
	body, err := json.Marshal(payload)
	if err != nil {
		return readerPassage{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, service.options.endpoint, bytes.NewReader(body))
	if err != nil {
		return readerPassage{}, err
	}
	request.Header.Set("Authorization", "Bearer "+service.options.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := service.options.client.Do(request)
	if err != nil {
		return readerPassage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return readerPassage{}, fmt.Errorf("OpenAI HTTP %d", response.StatusCode)
	}
	var result struct {
		Status string `json:"status"`
		Output []struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 150000)).Decode(&result); err != nil {
		return readerPassage{}, err
	}
	if result.Status != "completed" {
		return readerPassage{}, fmt.Errorf("OpenAI status %s", result.Status)
	}
	for _, item := range result.Output {
		for _, content := range item.Content {
			if content.Type == "output_text" {
				var passage readerPassage
				err := json.Unmarshal([]byte(content.Text), &passage)
				return passage, err
			}
		}
	}
	return readerPassage{}, errors.New("OpenAI returned no passage")
}
