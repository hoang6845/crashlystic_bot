package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/model"
)

const (
	anthropicURL   = "https://api.anthropic.com/v1/messages"
	anthropicModel = "claude-sonnet-4-6"
	maxTokens      = 300
)

type Analyzer struct {
	apiKey     string
	httpClient *http.Client
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func New(apiKey string) *Analyzer {
	return &Analyzer{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (a *Analyzer) Summarize(ctx context.Context, report *model.AppReport) string {
	if a.apiKey == "" {
		return a.ruleBased(report)
	}

	summary, err := a.callAPI(ctx, report)
	if err != nil {
		logger.Warn("  AI summary failed, using rule-based: %v", err)
		return a.ruleBased(report)
	}
	return summary
}

func (a *Analyzer) callAPI(ctx context.Context, report *model.AppReport) (string, error) {
	prompt := buildPrompt(report)

	reqBody := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: maxTokens,
		Messages: []anthropicMessage{
			{Role: "user", Content: prompt},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("creating HTTP request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", a.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp anthropicResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("parsing response: %w", err)
	}

	if apiResp.Error != nil {
		return "", fmt.Errorf("API error %s: %s", apiResp.Error.Type, apiResp.Error.Message)
	}

	for _, content := range apiResp.Content {
		if content.Type == "text" && content.Text != "" {
			return strings.TrimSpace(content.Text), nil
		}
	}

	return "", fmt.Errorf("no text content in response")
}

func buildPrompt(r *model.AppReport) string {
	topIssueStr := "None identified"
	if r.TopIssue != "" {
		topIssueStr = fmt.Sprintf("%s (%d events, %d users)", r.TopIssue, r.TopIssueEvents, r.AffectedUsers)
	}

	topIssuesList := ""
	for i, issue := range r.Top5Issues {
		topIssuesList += fmt.Sprintf("\n  %d. %s (events: %d, users: %d)",
			i+1, issue.Title, issue.EventCount, issue.AffectedUsers)
	}
	if topIssuesList == "" {
		topIssuesList = "\n  None"
	}

	return fmt.Sprintf(`You are a mobile app crash analytics expert. Analyze this Firebase Crashlytics daily report and provide a concise, actionable summary.

App: %s
Date: %s
Crash-Free Users: %s
Crash-Free Sessions: %s
Fatal Crashes: %d
ANR Count: %d
New Issues: %d
Regressions: %d
Top Issue: %s
Latest Version: %s
Android Version: %s
Top Crash Issues:%s

Write a 3-5 sentence summary that includes:
1. Overall stability assessment (is this good or concerning?)
2. Most critical crash issue and its impact
3. Any notable trends or patterns
4. Recommended priority level (LOW/MEDIUM/HIGH/CRITICAL) and next action

Be direct and specific. Use actual numbers from the data.`,
		r.App, r.Date,
		r.CrashFreeUsers, r.CrashFreeSessions,
		r.Fatal, r.ANR, r.NewIssues, r.Regressions,
		topIssueStr, r.LatestVersion, r.AndroidVersion,
		topIssuesList)
}

func (a *Analyzer) ruleBased(r *model.AppReport) string {
	var parts []string

	cfuStr := r.CrashFreeUsers
	if cfuStr == "" {
		cfuStr = "N/A"
	}
	parts = append(parts, fmt.Sprintf("App %s crash-free users: %s.", r.App, cfuStr))

	if r.Fatal > 0 {
		parts = append(parts, fmt.Sprintf("Recorded %d fatal crashes and %d ANRs today.", r.Fatal, r.ANR))
	} else {
		parts = append(parts, "No fatal crashes recorded in the last 24 hours.")
	}

	if r.NewIssues > 0 {
		parts = append(parts, fmt.Sprintf("%d new issue(s) detected; %d regression(s) noted.", r.NewIssues, r.Regressions))
	}

	if r.TopIssue != "" {
		parts = append(parts, fmt.Sprintf("Top crash: %s (%d events, %d affected users).", r.TopIssue, r.TopIssueEvents, r.AffectedUsers))
	}

	priority := "LOW"
	switch {
	case r.Fatal > 100 || r.Regressions > 5:
		priority = "CRITICAL"
	case r.Fatal > 30 || r.NewIssues > 5:
		priority = "HIGH"
	case r.Fatal > 10 || r.NewIssues > 0:
		priority = "MEDIUM"
	}
	parts = append(parts, fmt.Sprintf("Priority: %s.", priority))

	return strings.Join(parts, " ")
}
// đitcumay
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung