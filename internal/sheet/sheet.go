package sheet
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/crash-monitor/internal/logger"
	"github.com/crash-monitor/internal/model"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

const (
	SheetName = "Crash Reports"

	headerRow = "Date,App,Crash Free Users,Crash Free Sessions,Fatal,ANR,New Issues,Regressions,Top Issue,Events,Users,AI Summary"
)

type Client struct {
	svc           *sheets.Service
	spreadsheetID string
}

func New(ctx context.Context, credentialsFile, spreadsheetID string) (*Client, error) {
	var svc *sheets.Service
	var err error

	if credentialsFile != "" {
		data, readErr := os.ReadFile(credentialsFile)
		if readErr != nil {
			return nil, fmt.Errorf("reading credentials file %q: %w", credentialsFile, readErr)
		}

		creds, credsErr := google.CredentialsFromJSON(ctx, data, sheets.SpreadsheetsScope)
		if credsErr != nil {
			return nil, fmt.Errorf("parsing credentials: %w", credsErr)
		}

		svc, err = sheets.NewService(ctx, option.WithCredentials(creds))
	} else {
		svc, err = sheets.NewService(ctx)
	}

	if err != nil {
		return nil, fmt.Errorf("creating sheets service: %w", err)
	}

	return &Client{
		svc:           svc,
		spreadsheetID: spreadsheetID,
	}, nil
}

func (c *Client) EnsureSheet(ctx context.Context) error {
	ss, err := c.svc.Spreadsheets.Get(c.spreadsheetID).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("getting spreadsheet: %w", err)
	}

	var sheetExists bool
	for _, s := range ss.Sheets {
		if s.Properties.Title == SheetName {
			sheetExists = true
			break
		}
	}

	if !sheetExists {
		req := &sheets.BatchUpdateSpreadsheetRequest{
			Requests: []*sheets.Request{
				{
					AddSheet: &sheets.AddSheetRequest{
						Properties: &sheets.SheetProperties{
							Title: SheetName,
						},
					},
				},
			},
		}
		if _, err := c.svc.Spreadsheets.BatchUpdate(c.spreadsheetID, req).Context(ctx).Do(); err != nil {
			return fmt.Errorf("creating sheet: %w", err)
		}
		logger.Info("  Created new sheet: %s", SheetName)

		if err := c.appendRows(ctx, [][]interface{}{buildHeaderRow()}); err != nil {
			return fmt.Errorf("adding header row: %w", err)
		}

		if err := c.formatHeader(ctx); err != nil {
			logger.Warn("  Could not format header: %v", err)
		}

		return nil
	}

	resp, err := c.svc.Spreadsheets.Values.
		Get(c.spreadsheetID, fmt.Sprintf("%s!A1:L1", SheetName)).
		Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("checking header row: %w", err)
	}

	if len(resp.Values) == 0 {
		if err := c.appendRows(ctx, [][]interface{}{buildHeaderRow()}); err != nil {
			return fmt.Errorf("adding header row: %w", err)
		}
		_ = c.formatHeader(ctx)
	}

	return nil
}

func (c *Client) AppendReports(ctx context.Context, reports []*model.AppReport) error {
	if len(reports) == 0 {
		logger.Warn("  No reports to append")
		return nil
	}

	var rows [][]interface{}
	for _, r := range reports {
		if r == nil {
			continue
		}
		rows = append(rows, buildRow(r))
	}

	if len(rows) == 0 {
		return nil
	}

	if err := c.appendRows(ctx, rows); err != nil {
		return fmt.Errorf("appending %d rows: %w", len(rows), err)
	}

	logger.Info("  Appended %d row(s) to %s", len(rows), SheetName)
	return nil
}

func (c *Client) appendRows(ctx context.Context, rows [][]interface{}) error {
	vr := &sheets.ValueRange{Values: rows}
	_, err := c.svc.Spreadsheets.Values.
		Append(c.spreadsheetID, fmt.Sprintf("%s!A:L", SheetName), vr).
		ValueInputOption("USER_ENTERED").
		InsertDataOption("INSERT_ROWS").
		Context(ctx).
		Do()
	return err
}

func (c *Client) formatHeader(ctx context.Context) error {
	ss, err := c.svc.Spreadsheets.Get(c.spreadsheetID).Context(ctx).Do()
	if err != nil {
		return err
	}

	var sheetID int64
	for _, s := range ss.Sheets {
		if s.Properties.Title == SheetName {
			sheetID = s.Properties.SheetId
			break
		}
	}

	req := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				RepeatCell: &sheets.RepeatCellRequest{
					Range: &sheets.GridRange{
						SheetId:          sheetID,
						StartRowIndex:    0,
						EndRowIndex:      1,
						StartColumnIndex: 0,
						EndColumnIndex:   12,
					},
					Cell: &sheets.CellData{
						UserEnteredFormat: &sheets.CellFormat{
							TextFormat: &sheets.TextFormat{Bold: true},
							BackgroundColor: &sheets.Color{
								Red:   0.26,
								Green: 0.52,
								Blue:  0.96,
							},
						},
					},
					Fields: "userEnteredFormat(textFormat,backgroundColor)",
				},
			},
			{
				UpdateSheetProperties: &sheets.UpdateSheetPropertiesRequest{
					Properties: &sheets.SheetProperties{
						SheetId: sheetID,
						GridProperties: &sheets.GridProperties{
							FrozenRowCount: 1,
						},
					},
					Fields: "gridProperties.frozenRowCount",
				},
			},
			{
				AutoResizeDimensions: &sheets.AutoResizeDimensionsRequest{
					Dimensions: &sheets.DimensionRange{
						SheetId:    sheetID,
						Dimension:  "COLUMNS",
						StartIndex: 0,
						EndIndex:   12,
					},
				},
			},
		},
	}

	_, err = c.svc.Spreadsheets.BatchUpdate(c.spreadsheetID, req).Context(ctx).Do()
	return err
}

func buildHeaderRow() []interface{} {
	headers := strings.Split(headerRow, ",")
	row := make([]interface{}, len(headers))
	for i, h := range headers {
		row[i] = h
	}
	return row
}

func buildRow(r *model.AppReport) []interface{} {
	topIssue := r.TopIssue
	if topIssue == "" {
		topIssue = "None"
	}

	summary := r.AISummary
	if r.Error != "" {
		summary = fmt.Sprintf("ERROR: %s", r.Error)
	}

	return []interface{}{
		r.Date,
		r.App,
		r.CrashFreeUsers,
		r.CrashFreeSessions,
		r.Fatal,
		r.ANR,
		r.NewIssues,
		r.Regressions,
		topIssue,
		r.TopIssueEvents,
		r.AffectedUsers,
		summary,
	}
}

func (c *Client) GetLastReportDate(ctx context.Context, appName string) (string, error) {
	resp, err := c.svc.Spreadsheets.Values.
		Get(c.spreadsheetID, fmt.Sprintf("%s!A:B", SheetName)).
		Context(ctx).Do()
	if err != nil {
		return "", err
	}

	today := time.Now().Format("2006-01-02")
	for i := len(resp.Values) - 1; i >= 1; i-- {
		row := resp.Values[i]
		if len(row) >= 2 {
			date := fmt.Sprintf("%v", row[0])
			name := fmt.Sprintf("%v", row[1])
			if name == appName && date != today {
				return date, nil
			}
		}
	}

	return "", nil
}
