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
	"net/http"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

const defaultResponsesURL = "https://api.openai.com/v1/responses"

var mockHunParentheses = regexp.MustCompile(`\([^)]*\)`)

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
	types         map[string]sentenceType
	allTypes      map[string]sentenceType
	pictures      map[string]bool
	characters    map[string]string
	allCharacters map[string]string
}

type passageTarget struct {
	word          examWord
	character     string
	characterText string
	context       readingContext
}

type sentenceType struct {
	words   map[string]examWord
	context readingContext
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
			Hanja   string `json:"hanja"`
			Meaning string `json:"meaning"`
		} `json:"characters"`
		PictureTargets []struct {
			Hanja string `json:"hanja"`
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
	allAllowed := make(map[rune]bool)
	allCharacters := make(map[string]string)
	for _, config := range configs {
		for _, character := range config.Characters {
			if utf8.RuneCountInString(character.Hanja) == 1 {
				allAllowed[[]rune(character.Hanja)[0]] = true
				if onlyHangul(character.Meaning) && utf8.RuneCountInString(character.Meaning) >= 2 && utf8.RuneCountInString(character.Meaning) <= 5 {
					allCharacters[character.Hanja] = character.Meaning
				}
			}
		}
	}
	if levelBytes, levelErr := fs.ReadFile(files, "data/levels-sangong.json"); levelErr == nil {
		var levels struct {
			Variants map[string]json.RawMessage `json:"variants"`
			Groups   []struct {
				Characters []string `json:"characters"`
			} `json:"groups"`
		}
		if err := json.Unmarshal(levelBytes, &levels); err != nil {
			return nil, err
		}
		for _, group := range levels.Groups {
			for _, hanja := range group.Characters {
				if _, variant := levels.Variants[hanja]; !variant && utf8.RuneCountInString(hanja) == 1 {
					allAllowed[[]rune(hanja)[0]] = true
				}
			}
		}
		if insightBytes, insightErr := fs.ReadFile(files, "data/insights.json"); insightErr == nil {
			var insights struct {
				Characters map[string]struct {
					Hun string `json:"hun"`
				} `json:"characters"`
			}
			if err := json.Unmarshal(insightBytes, &insights); err != nil {
				return nil, err
			}
			for _, group := range levels.Groups {
				for _, hanja := range group.Characters {
					if _, variant := levels.Variants[hanja]; variant {
						continue
					}
					if _, exists := allCharacters[hanja]; exists {
						continue
					}
					first := strings.Split(insights.Characters[hanja].Hun, "|")[0]
					first = mockHunParentheses.ReplaceAllString(first, "")
					first = strings.TrimSpace(strings.ReplaceAll(first, ":", ""))
					runes := []rune(first)
					if len(runes) < 2 {
						continue
					}
					meaning := strings.TrimSpace(string(runes[:len(runes)-1]))
					if onlyHangul(meaning) && utf8.RuneCountInString(meaning) >= 2 && utf8.RuneCountInString(meaning) <= 5 {
						allCharacters[hanja] = meaning
					}
				}
			}
		}
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
	service := &sentenceService{grades: make(map[string]sentenceGrade), options: options}
	for level, config := range configs {
		grade := sentenceGrade{types: make(map[string]sentenceType), allTypes: make(map[string]sentenceType), pictures: make(map[string]bool), characters: make(map[string]string), allCharacters: allCharacters}
		allowed := make(map[rune]bool)
		for _, character := range config.Characters {
			for _, symbol := range character.Hanja {
				allowed[symbol] = true
			}
			if utf8.RuneCountInString(character.Hanja) == 1 && onlyHangul(character.Meaning) && utf8.RuneCountInString(character.Meaning) >= 2 && utf8.RuneCountInString(character.Meaning) <= 5 {
				grade.characters[character.Hanja] = character.Meaning
			}
		}
		meaningCounts := make(map[string]int)
		for _, meaning := range grade.characters {
			meaningCounts[meaning]++
		}
		for hanja, meaning := range grade.characters {
			if meaningCounts[meaning] != 1 {
				delete(grade.characters, hanja)
			}
		}
		for _, picture := range config.PictureTargets {
			if utf8.RuneCountInString(picture.Hanja) != 1 || !allowed[[]rune(picture.Hanja)[0]] {
				return nil, fmt.Errorf("invalid picture target for %s", level)
			}
			grade.pictures[picture.Hanja] = true
		}
		for _, section := range config.Format.Sections {
			context := section.ReadingContext
			if context.Kind == "" {
				continue
			}
			if (context.Kind != "sentence" && context.Kind != "passage" && context.Kind != "blank" && context.Kind != "paired") || (context.Kind == "paired" && section.Type != "passage") || context.WordLength < 2 || context.MinCharacters < 10 || context.MaxCharacters < context.MinCharacters || grade.types[section.Type].words != nil {
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
			grade.types[section.Type] = sentenceType{words: words, context: context}
			allWords := make(map[string]examWord)
			allCounts := make(map[string]int)
			for _, row := range catalog {
				if len(row) < 4 {
					continue
				}
				var hanja, reading string
				var definitions []string
				if json.Unmarshal(row[0], &hanja) != nil || json.Unmarshal(row[1], &reading) != nil || json.Unmarshal(row[3], &definitions) != nil {
					continue
				}
				if utf8.RuneCountInString(hanja) != context.WordLength || utf8.RuneCountInString(reading) != context.WordLength || !onlyHangul(reading) || !onlyAllowed(hanja, allAllowed) {
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
				allCounts[hanja]++
				allWords[hanja] = examWord{hanja, reading, meaning}
			}
			for hanja, count := range allCounts {
				if count != 1 {
					delete(allWords, hanja)
				}
			}
			grade.allTypes[section.Type] = sentenceType{words: allWords, context: context}
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
	if scope := r.URL.Query().Get("scope"); scope != "" && scope != "all" {
		http.Error(w, "지원하지 않는 출제 범위입니다", http.StatusBadRequest)
		return
	}
	all := r.URL.Query().Get("scope") == "all"
	types := grade.types
	characters := grade.characters
	if all {
		types, characters = grade.allTypes, grade.allCharacters
	}
	wordsByType := make(map[string][]string)
	for name, section := range types {
		words := make([]string, 0, len(section.words))
		for hanja := range section.words {
			words = append(words, hanja)
		}
		slices.Sort(words)
		wordsByType[name] = words
	}
	passageCharacters := make([]string, 0, len(grade.characters))
	if types["passage"].context.Kind == "paired" {
		for hanja := range characters {
			passageCharacters = append(passageCharacters, hanja)
		}
		slices.Sort(passageCharacters)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		WordsByType       map[string][]string `json:"wordsByType"`
		PassageCharacters []string            `json:"passageCharacters"`
		GenerationEnabled bool                `json:"generationEnabled"`
		ImageAvailable    bool                `json:"imageAvailable"`
	}{wordsByType, passageCharacters, s.sentences.options.apiKey != "", len(grade.pictures) > 0})
}

func (s *Server) sentence(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "독해 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Level   string   `json:"level"`
		Scope   string   `json:"scope"`
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
	if request.Scope != "" && request.Scope != "level" && request.Scope != "all" {
		http.Error(w, "지원하지 않는 출제 범위입니다", http.StatusBadRequest)
		return
	}
	types := grade.types
	if request.Scope == "all" {
		types = grade.allTypes
	}
	section, ok := types[request.Type]
	if !ok || section.context.Kind == "paired" {
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
	if s.sentences.options.apiKey == "" {
		http.Error(w, "OpenAI API key is not configured", http.StatusServiceUnavailable)
		return
	}
	answer, generationErr := s.sentences.generateValid(r.Context(), request.Level, word, section.context, choices)
	if generationErr != nil {
		var ambiguity *blankAmbiguity
		if errors.As(generationErr, &ambiguity) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string][]string{"retryChoices": ambiguity.retryChoices})
			return
		}
		log.Printf("mock reading %s %s: %v", request.Level, request.Hanja, generationErr)
		http.Error(w, "독해 문장을 준비할 수 없습니다. 다시 시도하세요", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(answer)
}

func (s *Server) passage(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "독해 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Level     string `json:"level"`
		Scope     string `json:"scope"`
		Word      string `json:"word"`
		Character string `json:"character"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil {
		http.Error(w, "독해 요청이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	grade, ok := s.sentences.grades[request.Level]
	if !ok {
		http.Error(w, "지원하지 않는 급수입니다", http.StatusBadRequest)
		return
	}
	if request.Scope != "" && request.Scope != "level" && request.Scope != "all" {
		http.Error(w, "지원하지 않는 출제 범위입니다", http.StatusBadRequest)
		return
	}
	types := grade.types
	characters := grade.characters
	if request.Scope == "all" {
		types, characters = grade.allTypes, grade.allCharacters
	}
	section, ok := types["passage"]
	if !ok || section.context.Kind != "paired" {
		http.Error(w, "지원하지 않는 독해 유형입니다", http.StatusBadRequest)
		return
	}
	word, validWord := section.words[request.Word]
	characterText, validCharacter := characters[request.Character]
	if !validWord || !validCharacter || strings.Contains(request.Word, request.Character) {
		http.Error(w, "급수에 없는 독해 대상입니다", http.StatusBadRequest)
		return
	}
	target := passageTarget{word, request.Character, characterText, section.context}
	if s.sentences.options.apiKey == "" {
		http.Error(w, "OpenAI API key is not configured", http.StatusServiceUnavailable)
		return
	}
	text, err := s.sentences.generatePassage(r.Context(), request.Level, target)
	if err != nil {
		log.Printf("mock passage %s %s %s: %v", request.Level, request.Word, request.Character, err)
		http.Error(w, "독해 글을 준비할 수 없습니다. 다시 시도하세요", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		Word          string `json:"word"`
		Character     string `json:"character"`
		CharacterText string `json:"characterText"`
		Text          string `json:"text"`
		Source        string `json:"source"`
	}{request.Word, request.Character, target.characterText, text, "ChatGPT"})
}

func (service *sentenceService) generatePassage(ctx context.Context, level string, target passageTarget) (string, error) {
	first := "㉠" + target.word.reading
	second := "㉡" + target.characterText
	instructions := "한국어 상공회의소 한자 시험에서 두 문제가 공유하는 독해 지문처럼, 하나의 자연스러운 이야기 지문을 쓰세요. 같은 지문에서 ㉠의 한자어 표기와 ㉡의 한자 뜻을 각각 한 문제씩 묻습니다. JSON의 text 필드에는 지문만 넣으세요. 첫째 표시에는 [[A]], 둘째 표시에는 [[B]]를 정확히 한 번씩 쓰세요. 서버가 [[A]]를 첫째 지정 표현으로, [[B]]를 둘째 지정 표현으로 바꿉니다. 두 표시는 서로 다른 문장의 자연스러운 위치에 놓고, 조사와 어미는 표시 뒤에 붙이세요. 다른 한자, 다른 동그라미 표시, 질문, 정답, 제목은 쓰지 마세요."
	baseInput := fmt.Sprintf("급수: %s급\n첫째 지정 표현: %s (한자어 %s, 뜻 %s)\n둘째 지정 표현: %s (한자 %s)\n[[A]]와 [[B]]는 각각 위 지정 표현으로 바뀝니다. 서로 다른 문장에 넣고 하나의 구체적인 상황을 이어 쓰세요.\n지문 길이: %d~%d자 (치환 후 공백 포함, 가능한 중간 길이로 작성)", level, first, target.word.hanja, target.word.meaning, second, target.character, target.context.MinCharacters, target.context.MaxCharacters)
	schema := map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}}, "required": []string{"text"}, "additionalProperties": false}
	input := baseInput
	reason := ""
	for attempt := 1; attempt <= 4; attempt++ {
		var result struct {
			Text string `json:"text"`
		}
		if err := service.requestStructured(ctx, instructions, input, schema, target.context.MaxCharacters, &result); err != nil {
			return "", err
		}
		text, invalid := validatePairedPassage(result.Text, target)
		if invalid == "" {
			return text, nil
		}
		reason = invalid
		log.Printf("mock passage candidate rejected level=%s word=%s character=%s attempt=%d reason=%s", level, target.word.hanja, target.character, attempt, reason)
		input = baseInput + "\n이전 응답의 문제: " + reason + ". 이전 글을 반복하지 말고 새 지문을 작성하세요. [[A]]와 [[B]]를 각각 정확히 한 번 쓰고 길이도 다시 확인하세요."
	}
	return "", fmt.Errorf("model returned no valid paired passage after 4 attempts: %s", reason)
}

func validatePairedPassage(raw string, target passageTarget) (string, string) {
	text := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(raw, "\r\n", "\n"), "\r", "\n"))
	first := "㉠" + target.word.reading
	second := "㉡" + target.characterText
	if strings.Count(text, "[[A]]") > 1 || strings.Count(text, "[[B]]") > 1 {
		return "", "표시 자리표가 중복됨"
	}
	text = strings.ReplaceAll(text, "[[A]]", first)
	text = strings.ReplaceAll(text, "[[B]]", second)
	for _, marker := range []string{"㉠", "㉡"} {
		if index := strings.Index(text, marker); index >= 0 {
			after := text[index+len(marker):]
			text = text[:index+len(marker)] + strings.TrimLeft(after, " \t\n")
		}
	}
	length := utf8.RuneCountInString(text)
	if length < target.context.MinCharacters || length > target.context.MaxCharacters {
		return "", fmt.Sprintf("길이 %d자, 허용 %d~%d자", length, target.context.MinCharacters, target.context.MaxCharacters)
	}
	if strings.Count(text, "㉠") != 1 || strings.Count(text, first) != 1 {
		return "", "첫째 표시 또는 독음이 정확하지 않음"
	}
	if strings.Count(text, "㉡") != 1 || strings.Count(text, second) != 1 {
		return "", "둘째 표시 또는 뜻이 정확하지 않음"
	}
	if strings.Index(text, "㉠") > strings.Index(text, "㉡") {
		return "", "㉠과 ㉡의 순서가 바뀜"
	}
	for _, symbol := range text {
		if unicode.Is(unicode.Han, symbol) {
			return "", "지문에 한자가 포함됨"
		}
		if symbol >= '㉢' && symbol <= '㉿' {
			return "", "다른 동그라미 표시가 포함됨"
		}
	}
	return text, ""
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
	var value generatedReading
	err := service.requestStructured(ctx, instructions, input, schema, context.MaxCharacters, &value)
	value.Text = strings.TrimSpace(value.Text)
	return value, err
}

func (service *sentenceService) requestStructured(ctx context.Context, instructions, input string, schema map[string]any, maxCharacters int, destination any) error {
	payload := map[string]any{
		"model":             service.options.model,
		"reasoning":         map[string]string{"effort": "none"},
		"instructions":      instructions,
		"input":             input,
		"text":              map[string]any{"format": map[string]any{"type": "json_schema", "name": "mock_exam_reading", "strict": true, "schema": schema}},
		"max_output_tokens": max(256, maxCharacters*4),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, service.options.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+service.options.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := service.options.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("OpenAI returned HTTP %d", response.StatusCode)
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
		return err
	}
	if result.Status != "completed" {
		return fmt.Errorf("OpenAI response status %q", result.Status)
	}
	for _, output := range result.Output {
		for _, content := range output.Content {
			if content.Type != "output_text" {
				continue
			}
			if json.Unmarshal([]byte(content.Text), destination) == nil {
				return nil
			}
		}
	}
	return errors.New("OpenAI response has no text")
}
