package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestImageQuestionUsesAllowedLevelTarget(t *testing.T) {
	var buffer bytes.Buffer
	picture := image.NewRGBA(image.Rect(0, 0, 256, 256))
	picture.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := jpeg.Encode(&buffer, picture, nil); err != nil {
		t.Fatal(err)
	}
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing API key")
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if !strings.Contains(payload["prompt"].(string), "cloud") {
			t.Errorf("unexpected prompt: %v", payload["prompt"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]string{"b64_json": base64.StdEncoding.EncodeToString(buffer.Bytes())}}})
	}))
	defer upstream.Close()
	service, err := newSentenceService(os.DirFS("../../client"), sentenceOptions{apiKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{sentences: service, images: imageOptions{endpoint: upstream.URL, client: upstream.Client()}}
	bad := httptest.NewRecorder()
	server.imageQuestion(bad, httptest.NewRequest(http.MethodPost, "/api/mock-exam/image", bytes.NewBufferString(`{"level":"7","hanja":"人"}`)))
	if bad.Code != http.StatusBadRequest || calls != 0 {
		t.Fatalf("bad target: %d, calls=%d", bad.Code, calls)
	}
	good := httptest.NewRecorder()
	server.imageQuestion(good, httptest.NewRequest(http.MethodPost, "/api/mock-exam/image", bytes.NewBufferString(`{"level":"7","hanja":"雲"}`)))
	if good.Code != http.StatusOK || calls != 1 || !strings.Contains(good.Body.String(), "data:image/jpeg;base64,") {
		t.Fatalf("image: %d, calls=%d", good.Code, calls)
	}
}
