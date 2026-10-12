package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"strings"
)

const defaultImagesURL = "https://api.openai.com/v1/images/generations"

type imageOptions struct {
	model    string
	endpoint string
	client   *http.Client
}

func (s *Server) imageQuestion(w http.ResponseWriter, r *http.Request) {
	if s.sentenceErr != nil {
		http.Error(w, "그림 문항 자료를 불러올 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Level string `json:"level"`
		Hanja string `json:"hanja"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "그림 요청이 올바르지 않습니다", http.StatusBadRequest)
		return
	}
	grade, ok := s.sentences.grades[request.Level]
	if !ok {
		http.Error(w, "지원하지 않는 급수입니다", http.StatusBadRequest)
		return
	}
	subject, ok := grade.pictures[request.Hanja]
	if !ok {
		http.Error(w, "급수에 없는 그림 대상입니다", http.StatusBadRequest)
		return
	}
	options := s.sentences.options
	if options.apiKey == "" {
		http.Error(w, "그림 생성을 사용할 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	model := s.images.model
	if model == "" {
		model = "gpt-image-1-mini"
	}
	endpoint := s.images.endpoint
	if endpoint == "" {
		endpoint = defaultImagesURL
	}
	payload, _ := json.Marshal(map[string]any{
		"model":  model,
		"prompt": fmt.Sprintf("A clear, accurate educational illustration of %s. One central subject on a plain white background, natural colors, crisp outlines, no other subjects. Absolutely no letters, symbols, Chinese characters, numbers, labels, or watermark.", subject),
		"n":      1, "size": "1024x1024", "quality": "low", "output_format": "jpeg", "background": "opaque",
	})
	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		http.Error(w, "그림을 준비할 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	upstream.Header.Set("Authorization", "Bearer "+options.apiKey)
	upstream.Header.Set("Content-Type", "application/json")
	client := s.images.client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(upstream)
	if err != nil {
		log.Printf("mock image: %v", err)
		http.Error(w, "그림을 준비할 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		log.Printf("mock image: OpenAI HTTP %d", response.StatusCode)
		http.Error(w, "그림을 준비할 수 없습니다", http.StatusServiceUnavailable)
		return
	}
	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 6<<20)).Decode(&result); err != nil || len(result.Data) != 1 {
		http.Error(w, "그림 응답이 올바르지 않습니다", http.StatusServiceUnavailable)
		return
	}
	image, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
	if err != nil || len(image) > 4<<20 {
		http.Error(w, "그림 응답이 올바르지 않습니다", http.StatusServiceUnavailable)
		return
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(image))
	if err != nil || config.Width < 256 || config.Height < 256 {
		http.Error(w, "그림 응답이 올바르지 않습니다", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]string{"hanja": request.Hanja, "image": "data:image/jpeg;base64," + strings.TrimSpace(result.Data[0].B64JSON)})
}
