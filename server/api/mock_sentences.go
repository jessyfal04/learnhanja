package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/rand"
	"net/http"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

const defaultResponsesURL = "https://api.openai.com/v1/responses"

type sentenceOptions struct {
	apiKey   string
	model    string
	endpoint string
	client   *http.Client
}

type examWord struct {
	hanja   string
	reading string
	meaning string
}

type readingContext struct {
	Kind          string `json:"kind"`
	WordLength    int    `json:"wordLength"`
	MinCharacters int    `json:"minCharacters"`
	MaxCharacters int    `json:"maxCharacters"`
}

type sentenceAnswer struct {
	Hanja    string `json:"hanja"`
	Reading  string `json:"reading"`
	Meaning  string `json:"meaning"`
	Sentence string `json:"sentence"`
	Source   string `json:"source"`
}

type generatedReading struct {
	Text    string   `json:"text"`
	Fitting []string `json:"fitting"`
}

type blankAmbiguity struct{ retryChoices []string }

func (e *blankAmbiguity) Error() string { return "blank choices are ambiguous" }

type sentenceGrade struct {
	types    map[string]sentenceType
	pictures map[string]string
}

type sentenceType struct {
	words     map[string]examWord
	sentences map[string][]string
	context   readingContext
}

type sentenceService struct {
	grades  map[string]sentenceGrade
	options sentenceOptions
}

func newSentenceService(files fs.FS, options sentenceOptions) (*sentenceService, error) {
	configBytes, err := fs.ReadFile(files, "data/mock-exam.json")
	if err != nil {
		return nil, err
	}
	catalogBytes, err := fs.ReadFile(files, "data/vocabulary.json")
	if err != nil {
		return nil, err
	}
	var configs map[string]struct {
		Characters []struct {
			Hanja string `json:"hanja"`
		} `json:"characters"`
		PictureTargets []struct {
			Hanja   string `json:"hanja"`
			Subject string `json:"subject"`
		} `json:"pictureTargets"`
		Format struct {
			Sections []struct {
				Type           string         `json:"type"`
				ReadingContext readingContext `json:"readingContext"`
			} `json:"sections"`
		} `json:"format"`
	}
	if err := json.Unmarshal(configBytes, &configs); err != nil {
		return nil, err
	}
	var catalog [][]json.RawMessage
	if err := json.Unmarshal(catalogBytes, &catalog); err != nil {
		return nil, err
	}
	if options.model == "" {
		options.model = "gpt-6-luna"
	}
	if options.endpoint == "" {
		options.endpoint = defaultResponsesURL
	}
	if options.client == nil {
		options.client = http.DefaultClient
	}
	var sentenceBank struct {
		Levels map[string]map[string][]string `json:"levels"`
	}
	bankBytes, err := fs.ReadFile(files, "data/mock-exam-sentences.json")
	if err == nil {
		if err := json.Unmarshal(bankBytes, &sentenceBank); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	service := &sentenceService{grades: make(map[string]sentenceGrade), options: options}
	for level, config := range configs {
		grade := sentenceGrade{types: make(map[string]sentenceType), pictures: make(map[string]string)}
		allowed := make(map[rune]bool)
		for _, character := range config.Characters {
			for _, symbol := range character.Hanja {
				allowed[symbol] = true
			}
		}
		for _, picture := range config.PictureTargets {
			if utf8.RuneCountInString(picture.Hanja) != 1 || !allowed[[]rune(picture.Hanja)[0]] || strings.TrimSpace(picture.Subject) == "" {
				return nil, fmt.Errorf("invalid picture target for %s", level)
			}
			grade.pictures[picture.Hanja] = picture.Subject
		}
		for _, section := range config.Format.Sections {
			context := section.ReadingContext
			if context.Kind == "" {
				continue
			}
			if (context.Kind != "sentence" && context.Kind != "passage" && context.Kind != "blank") || context.WordLength < 2 || context.MinCharacters < 10 || context.MaxCharacters < context.MinCharacters || grade.types[section.Type].words != nil {
				return nil, fmt.Errorf("invalid reading context for %s %s", level, section.Type)
			}
			words := make(map[string]examWord)
			counts := make(map[string]int)
			for _, row := range catalog {
				if len(row) < 4 {
					continue
				}
				var hanja, reading string
				var definitions []string
				if json.Unmarshal(row[0], &hanja) != nil || json.Unmarshal(row[1], &reading) != nil || json.Unmarshal(row[3], &definitions) != nil {
					continue
				}
				if utf8.RuneCountInString(hanja) != context.WordLength || utf8.RuneCountInString(reading) != context.WordLength || !onlyHangul(reading) || !onlyAllowed(hanja, allowed) {
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
				counts[hanja]++
				words[hanja] = examWord{hanja, reading, meaning}
			}
			for hanja, count := range counts {
				if count != 1 {
					delete(words, hanja)
				}
			}
			sentences := make(map[string][]string)
			if bank, ok := sentenceBank.Levels[level]; ok {
				for hanja, word := range words {
					for _, text := range bank[hanja] {
						if validGeneratedText(text, word, context) {
							sentences[hanja] = append(sentences[hanja], text)
						}
					}
				}
			}
			if options.apiKey == "" {
				for hanja := range words {
					if len(sentences[hanja]) == 0 {
						delete(words, hanja)
					}
				}
			}
			grade.types[section.Type] = sentenceType{words: words, sentences: sentences, context: context}
		}
		if len(grade.types) > 0 || len(grade.pictures) > 0 {
			service.grades[level] = grade
		}
	}
	return service, nil
}

func onlyHangul(value string) bool {
	if value == "" {
		return false
	}
	for _, symbol := range value {
		if symbol < '가' || symbol > '힣' {
			return false
		}
	}
	return true
}

func onlyAllowed(value string, allowed map[rune]bool) bool {
	if value == "" {
		return false
	}
	for _, symbol := range value {
		if !allowed[symbol] {
			return false
		}
	}
	return true
}

func (s *Server) sentenceManifest(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "독해 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	grade, ok := s.sentences.grades[r.URL.Query().Get("level")]
	if !ok {
		http.Error(w, "지원하지 않는 급수입니다", http.StatusBadRequest)
		return
	}
	wordsByType := make(map[string][]string)
	offlineAvailable := len(grade.types) > 0
	for name, section := range grade.types {
		words := make([]string, 0, len(section.words))
		for hanja := range section.words {
			words = append(words, hanja)
		}
		slices.Sort(words)
		wordsByType[name] = words
		offlineAvailable = offlineAvailable && len(words) > 0
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		WordsByType            map[string][]string `json:"wordsByType"`
		GenerationEnabled      bool                `json:"generationEnabled"`
		ImageGenerationEnabled bool                `json:"imageGenerationEnabled"`
	}{wordsByType, s.sentences.options.apiKey != "" || offlineAvailable, s.sentences.options.apiKey != ""})
}

func (s *Server) sentence(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "독해 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Level   string   `json:"level"`
		Type    string   `json:"type"`
		Hanja   string   `json:"hanja"`
		Choices []string `json:"choices"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "독해 요청이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	grade, ok := s.sentences.grades[request.Level]
	if !ok {
		http.Error(w, "지원하지 않는 급수입니다", http.StatusBadRequest)
		return
	}
	section, ok := grade.types[request.Type]
	if !ok {
		http.Error(w, "지원하지 않는 독해 유형입니다", http.StatusBadRequest)
		return
	}
	word, ok := section.words[request.Hanja]
	if !ok {
		http.Error(w, "급수에 없는 한자어입니다", http.StatusBadRequest)
		return
	}
	var choices []examWord
	if section.context.Kind == "blank" {
		if len(request.Choices) != 5 {
			http.Error(w, "빈칸 보기가 올바르지 않습니다", http.StatusBadRequest)
			return
		}
		seen := make(map[string]bool)
		for _, hanja := range request.Choices {
			choice, exists := section.words[hanja]
			if !exists || seen[hanja] {
				http.Error(w, "빈칸 보기가 올바르지 않습니다", http.StatusBadRequest)
				return
			}
			seen[hanja] = true
			choices = append(choices, choice)
		}
		if !seen[word.hanja] {
			http.Error(w, "정답이 보기에 없습니다", http.StatusBadRequest)
			return
		}
	} else if len(request.Choices) > 0 {
		http.Error(w, "독해 요청이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	var answer sentenceAnswer
	var generationErr error
	if s.sentences.options.apiKey != "" {
		answer, generationErr = s.sentences.generateValid(r.Context(), request.Level, word, section.context, choices)
	}
	if answer.Sentence == "" {
		var ambiguity *blankAmbiguity
		if errors.As(generationErr, &ambiguity) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string][]string{"retryChoices": ambiguity.retryChoices})
			return
		}
		if examples := section.sentences[word.hanja]; len(examples) > 0 {
			answer = sentenceAnswer{word.hanja, word.reading, word.meaning, examples[rand.Intn(len(examples))], "KRDict"}
		} else {
			if generationErr != nil {
				log.Printf("mock reading %s %s: %v", request.Level, request.Hanja, generationErr)
			}
			http.Error(w, "독해 문장을 준비할 수 없습니다. 다시 시도하세요", http.StatusServiceUnavailable)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(answer)
}

func (service *sentenceService) generateValid(ctx context.Context, level string, word examWord, context readingContext, choices []examWord) (sentenceAnswer, error) {
	for attempt := 0; attempt < 3; attempt++ {
		generated, err := service.generate(ctx, level, word, context, choices)
		if err != nil {
			return sentenceAnswer{}, err
		}
		if context.Kind == "blank" {
			allowed := make(map[string]bool)
			for _, choice := range choices {
				allowed[choice.hanja] = true
			}
			seen := make(map[string]bool)
			for _, choice := range generated.Fitting {
				if allowed[choice] {
					seen[choice] = true
				}
			}
			if validGeneratedText(generated.Text, word, context) && len(seen) == 1 && seen[word.hanja] && len(generated.Fitting) == 1 {
				return sentenceAnswer{word.hanja, word.reading, word.meaning, generated.Text, "ChatGPT"}, nil
			}
			retry := make([]string, 0, len(seen))
			for _, choice := range choices {
				if choice.hanja != word.hanja && seen[choice.hanja] {
					retry = append(retry, choice.hanja)
				}
			}
			return sentenceAnswer{}, &blankAmbiguity{retryChoices: retry}
		}
		if validGeneratedText(generated.Text, word, context) {
			return sentenceAnswer{word.hanja, word.reading, word.meaning, generated.Text, "ChatGPT"}, nil
		}
	}
	return sentenceAnswer{}, errors.New("model returned no valid reading context")
}

func validGeneratedText(text string, word examWord, context readingContext) bool {
	length := utf8.RuneCountInString(text)
	marker := word.hanja
	if context.Kind == "blank" {
		marker = "□□"
	}
	if length < context.MinCharacters || length > context.MaxCharacters || strings.Count(text, marker) != 1 || strings.Contains(text, word.reading) || strings.ContainsRune(text, '\r') {
		return false
	}
	if (context.Kind == "sentence" || context.Kind == "blank") && strings.ContainsRune(text, '\n') {
		return false
	}
	remaining := strings.Replace(text, marker, "", 1)
	if context.Kind == "blank" && (strings.ContainsRune(remaining, '□') || strings.Contains(remaining, word.hanja)) {
		return false
	}
	for _, symbol := range remaining {
		if unicode.Is(unicode.Han, symbol) {
			return false
		}
	}
	return true
}

func (service *sentenceService) generate(ctx context.Context, level string, word examWord, context readingContext, choices []examWord) (generatedReading, error) {
	instructions := "한국어 상공회의소 한자 독해 시험의 자연스러운 문장 또는 지문을 쓰세요. 일상이나 사회의 구체적 상황에서 지정 한자어를 주어진 뜻으로 정확히 한 번 사용하세요. 앞뒤에서 그 뜻을 그대로 되풀이하지 말고 문맥으로 뜻을 알 수 있게 하세요. 다른 한자는 절대 쓰지 마세요. 지정 단어의 한글 독음을 노출하지 마세요. 질문이나 정답은 쓰지 말고 본문만 JSON으로 반환하세요."
	if context.Kind == "blank" {
		instructions = "한국어 상공회의소 한자 독해 시험의 자연스러운 빈칸 문장을 쓰세요. 정답 한자어가 들어갈 자리를 정확히 하나의 □□로 표시하세요. 보기 다섯 개를 모두 고려하세요. 문장을 완성한 뒤 각 보기를 넣어 자연스럽고 의미상 맞는지 독립적으로 확인하여 fitting 배열에 해당 한자어를 모두 적으세요. 뜻이 같은 보기가 둘 이상이면 둘 다 적으세요. 억지로 정답을 하나로 만들지 마세요. 정답 한자어, 다른 한자, 지정 단어의 한글 독음, 정답을 본문에 쓰지 마세요. 다른 빈칸이나 네모도 쓰지 마세요. 본문은 text 필드에만 쓰세요."
	}
	schema := map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}}, "required": []string{"text"}, "additionalProperties": false}
	input := fmt.Sprintf("급수: %s급\n종류: %s\n한자어: %s\n독음(본문에 쓰지 않음): %s\n뜻: %s\n길이: %d~%d자", level, context.Kind, word.hanja, word.reading, word.meaning, context.MinCharacters, context.MaxCharacters)
	if context.Kind == "blank" {
		schema = map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}, "fitting": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}}, "required": []string{"text", "fitting"}, "additionalProperties": false}
		options := make([]map[string]string, 0, len(choices))
		for _, choice := range choices {
			options = append(options, map[string]string{"hanja": choice.hanja, "reading": choice.reading, "meaning": choice.meaning})
		}
		optionDetails, _ := json.Marshal(options)
		input += "\n정답: " + word.hanja + "\n보기(한자어, 독음, 뜻): " + string(optionDetails)
	}
	payload := map[string]any{
		"model":             service.options.model,
		"reasoning":         map[string]string{"effort": "none"},
		"instructions":      instructions,
		"input":             input,
		"text":              map[string]any{"format": map[string]any{"type": "json_schema", "name": "mock_exam_reading", "strict": true, "schema": schema}},
		"max_output_tokens": max(256, context.MaxCharacters*4),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return generatedReading{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, service.options.endpoint, bytes.NewReader(body))
	if err != nil {
		return generatedReading{}, err
	}
	request.Header.Set("Authorization", "Bearer "+service.options.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := service.options.client.Do(request)
	if err != nil {
		return generatedReading{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return generatedReading{}, fmt.Errorf("OpenAI returned HTTP %d", response.StatusCode)
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
	if err := json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result); err != nil {
		return generatedReading{}, err
	}
	if result.Status != "completed" {
		return generatedReading{}, fmt.Errorf("OpenAI response status %q", result.Status)
	}
	for _, output := range result.Output {
		for _, content := range output.Content {
			if content.Type != "output_text" {
				continue
			}
			var value generatedReading
			if json.Unmarshal([]byte(content.Text), &value) == nil {
				value.Text = strings.TrimSpace(value.Text)
				return value, nil
			}
		}
	}
	return generatedReading{}, errors.New("OpenAI response has no text")
}
