package model
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
type AppConfig struct {
	Name string `yaml:"name"`
	URL  string `yaml:"url"`
}

type Config struct {
	SpreadsheetID string      `yaml:"spreadsheet_id"`
	Apps          []AppConfig `yaml:"apps"`
	Anthropic     struct {
		APIKey string `yaml:"api_key"`
	} `yaml:"anthropic"`
	Google struct {
		CredentialsFile string `yaml:"credentials_file"`
	} `yaml:"google"`
	Browser struct {
		ProfileDir string `yaml:"profile_dir"`
		Headless   bool   `yaml:"headless"`
		Timeout    int    `yaml:"timeout_seconds"`
	} `yaml:"browser"`
	Scheduler struct {
		CronExpr string `yaml:"cron_expr"`
		Timezone string `yaml:"timezone"`
	} `yaml:"scheduler"`
}

type CrashIssue struct {
	Title        string `json:"title"`
	EventCount   int    `json:"event_count"`
	AffectedUsers int   `json:"affected_users"`
}
// đitcumay
type AppReport struct {
	Date               string       `json:"date"`
	App                string       `json:"app"`
	CrashFreeUsers     string       `json:"crash_free_users"`
	CrashFreeSessions  string       `json:"crash_free_sessions"`
	Fatal              int          `json:"fatal"`
	ANR                int          `json:"anr"`
	NewIssues          int          `json:"new_issues"`
	Regressions        int          `json:"regressions"`
	TopIssue           string       `json:"top_issue"`
	TopIssueEvents     int          `json:"top_issue_events"`
	AffectedUsers      int          `json:"affected_users"`
	LatestVersion      string       `json:"latest_version"`
	AndroidVersion     string       `json:"android_version"`
	Top5Issues         []CrashIssue `json:"top_5_issues"`
	AISummary          string       `json:"ai_summary"`
	Error              string       `json:"error,omitempty"`
}

type JobResult struct {
	Date    string
	Reports []*AppReport
	Errors  []string
}
