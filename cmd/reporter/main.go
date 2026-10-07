package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/crash-monitor/config"
	"github.com/crash-monitor/internal/ai"
	"github.com/crash-monitor/internal/browser"
	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/report"
	"github.com/crash-monitor/internal/scheduler"
	"github.com/crash-monitor/internal/sheet"
)

func main() {
	var (
		configFile = flag.String("config", "config.yaml", "Path to configuration file")
		runNow     = flag.Bool("run-now", false, "Run immediately without waiting for schedule")
		logLevel   = flag.String("log-level", "info", "Log level: debug, info, warn, error")
		logDir     = flag.String("log-dir", "./logs", "Directory for log files")
		noSheets   = flag.Bool("no-sheets", false, "Skip Google Sheets upload (dry run)")
	)
	flag.Parse()

	level := logger.INFO
	switch *logLevel {
	case "debug":
		level = logger.DEBUG
	case "warn":
		level = logger.WARN
	case "error":
		level = logger.ERROR
	}

	if err := logger.Init(*logDir, level); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Close()

	cfg, err := config.Load(*configFile)
	if err != nil {
		logger.Error("Config error: %v", err)
		os.Exit(1)
	}

	logger.Info("Loaded config: %d apps, spreadsheet=%s", len(cfg.Apps), cfg.SpreadsheetID)

	analyzer := ai.New(cfg.Anthropic.APIKey)
	if cfg.Anthropic.APIKey == "" {
		logger.Warn("No Anthropic API key configured — using rule-based summaries")
	}

	bw, err := browser.New(cfg)
	if err != nil {
		logger.Error("Browser init failed: %v", err)
		os.Exit(1)
	}
	defer bw.Close()

	var sheetsClient *sheet.Client
	if !*noSheets {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		sc, sheetErr := sheet.New(ctx, cfg.Google.CredentialsFile, cfg.SpreadsheetID)
		cancel()
		if sheetErr != nil {
			logger.Error("Google Sheets init failed: %v", sheetErr)
			logger.Warn("Continuing without Sheets integration. Use --no-sheets to suppress this warning.")
		} else {
			sheetsClient = sc
			logger.Info("Google Sheets client initialized")
		}
	} else {
		logger.Info("Running in dry-run mode (--no-sheets): Sheets upload disabled")
	}

	runner := report.New(cfg, bw, analyzer, sheetsClient)

	job := func(ctx context.Context) error {
		return runner.Run(ctx)
	}

	if *runNow {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
		defer cancel()

		if err := job(ctx); err != nil {
			logger.Error("Job failed: %v", err)
			os.Exit(1)
		}
		return
	}

	sched, err := scheduler.New(cfg.Scheduler.CronExpr, cfg.Scheduler.Timezone)
	if err != nil {
		logger.Error("Scheduler init failed: %v", err)
		os.Exit(1)
	}

	if err := sched.Schedule(job); err != nil {
		logger.Error("Failed to schedule job: %v", err)
		os.Exit(1)
	}

	sched.Start()
	logger.Info("Crash Monitor running. Press Ctrl+C to stop.")
	logger.Info("Schedule: %s (%s)", cfg.Scheduler.CronExpr, cfg.Scheduler.Timezone)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down...")
	sched.Stop()
	logger.Info("Goodbye.")
}
