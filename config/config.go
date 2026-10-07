package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/crash-monitor/internal/model"
	"gopkg.in/yaml.v3"
)

func Load(path string) (*model.Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file %q: %w", path, err)
	}

	expanded := os.ExpandEnv(string(data))

	var cfg model.Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parsing config YAML: %w", err)
	}

	if cfg.Browser.Timeout == 0 {
		cfg.Browser.Timeout = 60
	}
	if cfg.Browser.ProfileDir == "" {
		cfg.Browser.ProfileDir = "./browser-profile"
	}
	if cfg.Scheduler.CronExpr == "" {
		cfg.Scheduler.CronExpr = "30 8 * * *"
	}
	if cfg.Scheduler.Timezone == "" {
		cfg.Scheduler.Timezone = "Asia/Ho_Chi_Minh"
	}

	if v := os.Getenv("SPREADSHEET_ID"); v != "" {
		cfg.SpreadsheetID = v
	}
	if v := os.Getenv("ANTHROPIC_API_KEY"); v != "" {
		cfg.Anthropic.APIKey = v
	}
	if v := os.Getenv("GOOGLE_CREDENTIALS_FILE"); v != "" {
		cfg.Google.CredentialsFile = v
	}

	if err := validate(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func validate(cfg *model.Config) error {
	var errs []string

	if cfg.SpreadsheetID == "" {
		errs = append(errs, "spreadsheet_id is required")
	}
	if len(cfg.Apps) == 0 {
		errs = append(errs, "at least one app must be configured")
	}
	for i, app := range cfg.Apps {
		if app.Name == "" {
			errs = append(errs, fmt.Sprintf("apps[%d].name is required", i))
		}
		if app.URL == "" {
			errs = append(errs, fmt.Sprintf("apps[%d].url is required", i))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("config validation errors:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return nil
}
