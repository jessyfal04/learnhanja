package anki

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const apiVersion = 6

type Client struct {
	url        string
	httpClient *http.Client
}

func NewClient(url string, timeout time.Duration) *Client {
	return &Client{
		url: url,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) invoke(ctx context.Context, action string, params any, result any) error {
	if params == nil {
		params = struct{}{}
	}
	payload := struct {
		Action  string `json:"action"`
		Version int    `json:"version"`
		Params  any    `json:"params"`
	}{Action: action, Version: apiVersion, Params: params}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode AnkiConnect request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create AnkiConnect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("call AnkiConnect: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("AnkiConnect returned %s: %s", resp.Status, bytes.TrimSpace(message))
	}

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *string         `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("decode AnkiConnect response: %w", err)
	}
	if envelope.Error != nil && *envelope.Error != "" {
		return fmt.Errorf("AnkiConnect: %s", *envelope.Error)
	}
	if result == nil {
		return nil
	}
	if err := json.Unmarshal(envelope.Result, result); err != nil {
		return fmt.Errorf("decode AnkiConnect result for %s: %w", action, err)
	}
	return nil
}
