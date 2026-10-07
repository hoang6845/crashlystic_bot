package report
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/crash-monitor/internal/ai"
	"github.com/crash-monitor/internal/browser"
	"github.com/crash-monitor/internal/firebase"
	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/model"
	"github.com/crash-monitor/internal/sheet"
)

type Runner struct {
	cfg      *model.Config
	browser  *browser.Client
	scraper  *firebase.Scraper
	analyzer *ai.Analyzer
	sheets   *sheet.Client
}

func New(
	cfg *model.Config,
	bw *browser.Client,
	analyzer *ai.Analyzer,
	sheets *sheet.Client,
) *Runner {
	return &Runner{
		cfg:      cfg,
		browser:  bw,
		scraper:  firebase.New(bw, cfg),
		analyzer: analyzer,
		sheets:   sheets,
	}
}

func (r *Runner) Run(ctx context.Context) error {
	startTime := time.Now()
	date := startTime.Format("2006-01-02")

	logger.Separator()
	logger.Info("Starting daily crash report — %s", date)
	logger.Separator()

	if r.sheets != nil {
		if err := r.sheets.EnsureSheet(ctx); err != nil {
			logger.Warn("Could not ensure sheet exists: %v", err)
		}
	}

	result := &model.JobResult{Date: date}
	var successCount, errorCount int

	for _, app := range r.cfg.Apps {
		logger.Info("")
		logger.Info("Checking %s...", app.Name)

		report, err := r.processApp(ctx, app)
		if err != nil {
			logger.Error("  FAILED: %v", err)
			errorCount++
			result.Reports = append(result.Reports, &model.AppReport{
				Date:  date,
				App:   app.Name,
				Error: err.Error(),
			})
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", app.Name, err))
			continue
		}

		result.Reports = append(result.Reports, report)
		successCount++
		logger.Info("  Success ✓")

		jsonBytes, _ := json.MarshalIndent(report, "  ", "  ")
		logger.Debug("  Report data:\n%s", string(jsonBytes))
	}

	logger.Info("")
	logger.Info("Appending to Google Sheet...")

	if r.sheets != nil {
		if err := r.sheets.AppendReports(ctx, result.Reports); err != nil {
			logger.Error("Failed to append to Sheets: %v", err)
			return fmt.Errorf("appending to sheets: %w", err)
		}
	} else {
		for _, rep := range result.Reports {
			jsonBytes, _ := json.MarshalIndent(rep, "", "  ")
			logger.Info("Report (no sheets client): %s", string(jsonBytes))
		}
	}

	elapsed := time.Since(startTime).Round(time.Second)
	logger.Separator()
	logger.Info("Done. %d succeeded, %d failed. Elapsed: %v", successCount, errorCount, elapsed)

	if len(result.Errors) > 0 {
		logger.Warn("Errors encountered:")
		for _, e := range result.Errors {
			logger.Warn("  - %s", e)
		}
	}
	logger.Separator()

	return nil
}

func (r *Runner) processApp(ctx context.Context, app model.AppConfig) (*model.AppReport, error) {
	report, err := r.scraper.ScrapeApp(ctx, app)
	if err != nil {
		return nil, fmt.Errorf("scraping %s: %w", app.Name, err)
	}

	logger.Info("  Generating AI summary for %s...", app.Name)
	report.AISummary = r.analyzer.Summarize(ctx, report)

	return report, nil
}
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
