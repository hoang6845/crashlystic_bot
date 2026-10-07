package firebase
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/crash-monitor/internal/browser"
	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/model"
	"github.com/playwright-community/playwright-go"
)

const (
	maxRetries    = 3
	pageLoadWait  = 5 * time.Second
	selectorWait  = 30 * time.Second
)

type Scraper struct {
	client *browser.Client
	cfg    *model.Config
}

func New(client *browser.Client, cfg *model.Config) *Scraper {
	return &Scraper{client: client, cfg: cfg}
}

func (s *Scraper) ScrapeApp(ctx context.Context, app model.AppConfig) (*model.AppReport, error) {
	var (
		report *model.AppReport
		err    error
	)

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			backoff := time.Duration(attempt*attempt) * time.Second
			logger.Warn("  Retrying %s (attempt %d/%d) after %v", app.Name, attempt, maxRetries, backoff)
			time.Sleep(backoff)
		}

		report, err = s.scrapeOnce(ctx, app)
		if err == nil {
			return report, nil
		}
		logger.Warn("  Scrape attempt %d failed for %s: %v", attempt, app.Name, err)
	}

	return nil, fmt.Errorf("all %d attempts failed for %s: %w", maxRetries, app.Name, err)
}

func (s *Scraper) scrapeOnce(ctx context.Context, app model.AppConfig) (*model.AppReport, error) {
	page, err := s.client.NewPage()
	if err != nil {
		return nil, fmt.Errorf("creating page: %w", err)
	}
	defer func() { _ = page.Close() }()

	logger.Info("  Opening %s...", app.URL)
	if err := browser.NavigateWithRetry(page, app.URL, 2); err != nil {
		return nil, fmt.Errorf("navigating to %s: %w", app.Name, err)
	}

	time.Sleep(pageLoadWait)

	if err := s.ensureLoggedIn(ctx, page); err != nil {
		return nil, fmt.Errorf("login check failed: %w", err)
	}

	// Select " 24 hours" time range
	if err := s.selectLast24Hours(ctx, page); err != nil {
		logger.Warn("  Could not select time range, proceeding anyway: %v", err)
	}

	time.Sleep(3 * time.Second)

	report, err := s.extractDashboardData(ctx, page, app.Name)
	if err != nil {
		return nil, fmt.Errorf("extracting dashboard data: %w", err)
	}

	return report, nil
}

func (s *Scraper) ensureLoggedIn(ctx context.Context, page playwright.Page) error {
	url := page.URL()

	if strings.Contains(url, "accounts.google.com") || strings.Contains(url, "signin") {
		if s.cfg.Browser.Headless {
			return fmt.Errorf("not authenticated: please run once in non-headless mode to log in. Current URL: %s", url)
		}

		logger.Warn("  Login required — please complete login in the browser window...")
		deadline := time.Now().Add(5 * time.Minute)
		for time.Now().Before(deadline) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(3 * time.Second):
				currentURL := page.URL()
				if !strings.Contains(currentURL, "accounts.google.com") &&
					!strings.Contains(currentURL, "signin") {
					logger.Info("  Login successful!")
					time.Sleep(2 * time.Second)
					return nil
				}
			}
		}
		return fmt.Errorf("login timeout: user did not complete login within 5 minutes")
	}

	return nil
}

func (s *Scraper) selectLast24Hours(ctx context.Context, page playwright.Page) error {
	timeRangeSelectors := []string{
		"[data-testid='time-range-selector']",
		".time-range-selector",
		"mat-select[formcontrolname='dateRange']",
		"mat-select",
		"[aria-label*='time']",
		"[aria-label*='date']",
		".date-range-picker",
	}

	var pickerEl playwright.ElementHandle
	for _, sel := range timeRangeSelectors {
		el, err := page.QuerySelector(sel)
		if err == nil && el != nil {
			pickerEl = el
			break
		}
	}

	if pickerEl == nil {
		btns := []string{
			"button[aria-label*='date']",
			"button[aria-label*='time']",
			".date-range-button",
			"[data-testid*='date']",
		}
		for _, btn := range btns {
			if err := page.Click(btn); err == nil {
				time.Sleep(500 * time.Millisecond)
				break
			}
		}
	} else {
		if err := pickerEl.Click(); err != nil {
			return fmt.Errorf("clicking time range picker: %w", err)
		}
		time.Sleep(500 * time.Millisecond)
	}

	last24Selectors := []string{
		"mat-option:has-text('Last 24 hours')",
		"[role='option']:has-text('Last 24 hours')",
		"li:has-text('Last 24 hours')",
		"span:has-text('Last 24 hours')",
		"button:has-text('Last 24 hours')",
		"[value='LAST_24_HOURS']",
		"[data-value='last-24-hours']",
	}

	for _, sel := range last24Selectors {
		if err := page.Click(sel); err == nil {
			logger.Debug("  Selected 'Last 24 hours' via selector: %s", sel)
			return nil
		}
	}

	_, err := page.Evaluate(`() => {
		const options = Array.from(document.querySelectorAll('mat-option, [role="option"], li'));
		const opt = options.find(el => el.textContent.includes('Last 24 hours'));
		if (opt) { opt.click(); return true; }
		return false;
	}`)
	if err != nil {
		return fmt.Errorf("JS fallback for time range: %w", err)
	}

	return nil
}

func (s *Scraper) extractDashboardData(ctx context.Context, page playwright.Page, appName string) (*model.AppReport, error) {
	report := &model.AppReport{
		Date: time.Now().Format("2006-01-02"),
		App:  appName,
	}

	_, _ = browser.WaitForSelector(ctx, page, "body", selectorWait)

	result, err := page.Evaluate(`() => {
		function getText(selector) {
			const el = document.querySelector(selector);
			return el ? el.textContent.trim() : '';
		}

		function getTextAll(selector) {
			return Array.from(document.querySelectorAll(selector))
				.map(el => el.textContent.trim())
				.filter(t => t.length > 0);
		}

		function findByLabel(label) {
			const els = Array.from(document.querySelectorAll('*'));
			for (const el of els) {
				if (el.textContent.trim() === label) {
					// Try sibling or parent's next value element
					const parent = el.closest('[class*="stat"], [class*="card"], [class*="metric"]');
					if (parent) {
						const val = parent.querySelector('[class*="value"], [class*="number"], strong, b');
						if (val) return val.textContent.trim();
					}
					// Try next sibling
					const next = el.nextElementSibling;
					if (next) return next.textContent.trim();
					// Try parent's sibling
					const parentNext = el.parentElement?.nextElementSibling;
					if (parentNext) return parentNext.textContent.trim();
				}
			}
			return '';
		}

		// Extract page HTML for debugging
		const bodyText = document.body.innerText;

		// Look for crash-free metrics intelligently using labels
		const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

		let crashFreeUsers = 'Không tìm thấy';
		let crashFreeSessions = 'Không tìm thấy';

		for (let i = 0; i < lines.length; i++) {
			let lower = lines[i].toLowerCase();
			if ((lower.includes('crash-free users') || lower.includes('người dùng không gặp sự cố')) && crashFreeUsers === 'Không tìm thấy') {
				for (let j = 1; j <= 5; j++) {
					if (i+j < lines.length && lines[i+j].match(/\d+\.?\d*\s*%/)) {
						crashFreeUsers = lines[i+j].match(/(\d+\.?\d*\s*%)/)[0];
						break;
					}
				}
			}
			if ((lower.includes('crash-free sessions') || lower.includes('phiên không gặp sự cố')) && crashFreeSessions === 'Không tìm thấy') {
				for (let j = 1; j <= 5; j++) {
					if (i+j < lines.length && lines[i+j].match(/\d+\.?\d*\s*%/)) {
						crashFreeSessions = lines[i+j].match(/(\d+\.?\d*\s*%)/)[0];
						break;
					}
				}
			}
		}

		return {
			pageText: bodyText.substring(0, 5000),
			lines: lines.slice(0, 100),
			percentages: percentages,
			crashFreeUsers: crashFreeUsers,
			crashFreeSessions: crashFreeSessions,
			url: window.location.href,
			title: document.title,
		};
	}`)
	if err != nil {
		return nil, fmt.Errorf("evaluating dashboard JS: %w", err)
	}

	data, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected JS result type")
	}

	pageText := ""
	if pt, ok := data["pageText"].(string); ok {
		pageText = pt
	}

	if cfu, ok := data["crashFreeUsers"].(string); ok && cfu != "" && cfu != "Không tìm thấy" {
		report.CrashFreeUsers = cfu
	} else if percs, ok := data["percentages"].([]interface{}); ok && len(percs) >= 1 {
		report.CrashFreeUsers = fmt.Sprintf("%v", percs[0])
	}

	if cfs, ok := data["crashFreeSessions"].(string); ok && cfs != "" && cfs != "Không tìm thấy" {
		report.CrashFreeSessions = cfs
	} else if percs, ok := data["percentages"].([]interface{}); ok && len(percs) >= 2 {
		report.CrashFreeSessions = fmt.Sprintf("%v", percs[1])
	}

	report.Fatal = extractInt(pageText, `(?i)(?:fatal|crashes?)[^\d]*(\d+)`)
	report.ANR = extractInt(pageText, `(?i)ANR[^\d]*(\d+)`)
	report.NewIssues = extractInt(pageText, `(?i)new\s+issues?[^\d]*(\d+)`)
	report.Regressions = extractInt(pageText, `(?i)regressions?[^\d]*(\d+)`)

	report.LatestVersion = extractString(pageText, `(?i)(?:version|v)\s*([\d]+\.[\d]+\.[\d]+)`)
	report.AndroidVersion = extractString(pageText, `(?i)android\s*([\d]+(?:\.[\d]+)*)`)

	report.Top5Issues = extractTopIssues(page)
	if len(report.Top5Issues) > 0 {
		report.TopIssue = report.Top5Issues[0].Title
		report.TopIssueEvents = report.Top5Issues[0].EventCount
		report.AffectedUsers = report.Top5Issues[0].AffectedUsers
	}

	logger.Debug("  Extracted data for %s: crashes=%d, ANR=%d, new=%d",
		appName, report.Fatal, report.ANR, report.NewIssues)

	return report, nil
}

func extractTopIssues(page playwright.Page) []model.CrashIssue {
	result, err := page.Evaluate(`() => {
		const issues = [];
		
		// Common selectors for issue rows in Firebase Crashlytics
		const rowSelectors = [
			'[data-testid="issue-row"]',
			'.issue-row',
			'tr.issue',
			'[class*="issue-list"] [class*="row"]',
			'[class*="crash-issue"]',
			'tbody tr',
		];

		let rows = [];
		for (const sel of rowSelectors) {
			rows = Array.from(document.querySelectorAll(sel));
			if (rows.length > 0) break;
		}

		// If we found rows, extract data from each
		for (const row of rows.slice(0, 5)) {
			const cells = Array.from(row.querySelectorAll('td, [class*="cell"]'));
			if (cells.length >= 2) {
				const titleEl = row.querySelector('[class*="title"], [class*="name"], a, .exception');
				const title = titleEl ? titleEl.textContent.trim() : cells[0].textContent.trim();
				
				// Look for numbers in subsequent cells
				const nums = cells.slice(1).map(c => {
					const t = c.textContent.trim().replace(/,/g, '');
					const n = parseInt(t);
					return isNaN(n) ? 0 : n;
				}).filter(n => n > 0);

				if (title && title.length > 2) {
					issues.push({
						title: title.substring(0, 100),
						event_count: nums[0] || 0,
						affected_users: nums[1] || 0,
					});
				}
			}
		}

		// Fallback: look for any exception names in the page
		if (issues.length === 0) {
			const exceptionPattern = /([A-Z][a-zA-Z]+Exception|[A-Z][a-zA-Z]+Error|[A-Z][a-zA-Z]+Crash)/g;
			const bodyText = document.body.innerText;
			const matches = new Set();
			let m;
			while ((m = exceptionPattern.exec(bodyText)) !== null && matches.size < 5) {
				matches.add(m[1]);
			}
			for (const name of matches) {
				issues.push({ title: name, event_count: 0, affected_users: 0 });
			}
		}

		return issues;
	}`)

	if err != nil {
		return nil
	}

	issueList, ok := result.([]interface{})
	if !ok {
		return nil
	}

	var issues []model.CrashIssue
	for _, item := range issueList {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		issue := model.CrashIssue{
			Title:        stringVal(m, "title"),
			EventCount:   intVal(m, "event_count"),
			AffectedUsers: intVal(m, "affected_users"),
		}
		if issue.Title != "" {
			issues = append(issues, issue)
		}
	}
	return issues
}


func extractInt(text, pattern string) int {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return 0
	}
	m := re.FindStringSubmatch(text)
	if len(m) < 2 {
		return 0
	}
	n, _ := strconv.Atoi(strings.ReplaceAll(m[1], ",", ""))
	return n
}
// đitcumay
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
func extractString(text, pattern string) string {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return ""
	}
	m := re.FindStringSubmatch(text)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

func stringVal(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func intVal(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 0
}
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung