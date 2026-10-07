package browser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/model"
	"github.com/playwright-community/playwright-go"
)

type Client struct {
	pw         *playwright.Playwright
	browser    playwright.Browser
	context    playwright.BrowserContext
	cfg        *model.Config
	profileDir string
}

func New(cfg *model.Config) (*Client, error) {
	profileDir, err := filepath.Abs(cfg.Browser.ProfileDir)
	if err != nil {
		return nil, fmt.Errorf("resolving profile dir: %w", err)
	}
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		return nil, fmt.Errorf("creating profile dir: %w", err)
	}

	logger.Info("Installing Playwright browsers if needed...")
	if err := playwright.Install(&playwright.RunOptions{
		Browsers: []string{"chromium"},
		Verbose:  false,
	}); err != nil {
		return nil, fmt.Errorf("installing playwright: %w", err)
	}

	pw, err := playwright.Run()
	if err != nil {
		return nil, fmt.Errorf("starting playwright: %w", err)
	}

	logger.Info("Launching browser (headless=%v, profile=%s)", cfg.Browser.Headless, profileDir)

	ctx, err := pw.Chromium.LaunchPersistentContext(profileDir,
		playwright.BrowserTypeLaunchPersistentContextOptions{
			Headless: playwright.Bool(cfg.Browser.Headless),
			Args: []string{
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-gpu",
				"--lang=en-US",
			},
			Locale:    playwright.String("en-US"),
			TimezoneId: playwright.String("Asia/Ho_Chi_Minh"),
			ViewportSize: &playwright.Size{Width: 1440, Height: 900},
		},
	)
	if err != nil {
		_ = pw.Stop()
		return nil, fmt.Errorf("launching persistent context: %w", err)
	}

	return &Client{
		pw:         pw,
		context:    ctx,
		cfg:        cfg,
		profileDir: profileDir,
	}, nil
}

func (c *Client) Close() {
	if c.context != nil {
		_ = c.context.Close()
	}
	if c.pw != nil {
		_ = c.pw.Stop()
	}
}

func (c *Client) NewPage() (playwright.Page, error) {
	page, err := c.context.NewPage()
	if err != nil {
		return nil, fmt.Errorf("creating new page: %w", err)
	}

	timeout := float64(c.cfg.Browser.Timeout) * 1000
	page.SetDefaultTimeout(timeout)
	page.SetDefaultNavigationTimeout(timeout)

	return page, nil
}

func NavigateWithRetry(page playwright.Page, url string, maxRetries int) error {
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			backoff := time.Duration(attempt*attempt) * time.Second
			logger.Warn("Retry attempt %d/%d after %v...", attempt, maxRetries, backoff)
			time.Sleep(backoff)
		}

		_, err := page.Goto(url, playwright.PageGotoOptions{
			WaitUntil: playwright.WaitUntilStateNetworkidle,
		})
		if err == nil {
			return nil
		}
		lastErr = err
		logger.Warn("Navigation failed (attempt %d): %v", attempt, err)
	}
	return fmt.Errorf("navigation failed after %d attempts: %w", maxRetries, lastErr)
}

func WaitForSelector(ctx context.Context, page playwright.Page, selector string, timeout time.Duration) (playwright.ElementHandle, error) {
	opts := playwright.PageWaitForSelectorOptions{
		Timeout: playwright.Float(float64(timeout.Milliseconds())),
		State:   playwright.WaitForSelectorStateVisible,
	}
	el, err := page.WaitForSelector(selector, opts)
	if err != nil {
		return nil, fmt.Errorf("waiting for selector %q: %w", selector, err)
	}
	return el, nil
}

func SafeTextContent(page playwright.Page, selector string) string {
	el, err := page.QuerySelector(selector)
	if err != nil || el == nil {
		return ""
	}
	text, err := el.TextContent()
	if err != nil {
		return ""
	}
	return text
}

func SafeTextAll(page playwright.Page, selector string) []string {
	els, err := page.QuerySelectorAll(selector)
	if err != nil || len(els) == 0 {
		return nil
	}
	var results []string
	for _, el := range els {
		text, err := el.TextContent()
		if err == nil && text != "" {
			results = append(results, text)
		}
	}
	return results
}

func ClickWithRetry(page playwright.Page, selector string, maxRetries int) error {
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			time.Sleep(time.Duration(attempt) * time.Second)
		}
		if err := page.Click(selector); err == nil {
			return nil
		} else {
			lastErr = err
		}
	}
	return fmt.Errorf("click on %q failed after %d attempts: %w", selector, maxRetries, lastErr)
}
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung