package scheduler
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
import (
	"context"
	"fmt"
	"time"

	"github.com/crash-monitor/internal/logger"
	"github.com/robfig/cron/v3"
)

type JobFunc func(ctx context.Context) error

type Scheduler struct {
	c        *cron.Cron
	loc      *time.Location
	cronExpr string
}

func New(cronExpr, timezone string) (*Scheduler, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("loading timezone %q: %w", timezone, err)
	}

	c := cron.New(
		cron.WithLocation(loc),
		cron.WithSeconds(),    
		cron.WithChain(
			cron.Recover(cron.DefaultLogger), 
		),
	)

	return &Scheduler{
		c:        c,
		loc:      loc,
		cronExpr: cronExpr,
	}, nil
}

func (s *Scheduler) Schedule(job JobFunc) error {
	_, err := s.c.AddFunc(s.cronExpr, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
		defer cancel()

		logger.Info("Cron triggered at %s", time.Now().In(s.loc).Format("2006-01-02 15:04:05 MST"))
		if err := job(ctx); err != nil {
			logger.Error("Job failed: %v", err)
		}
	})
	if err != nil {
		return fmt.Errorf("adding cron job %q: %w", s.cronExpr, err)
	}
	return nil
}

func (s *Scheduler) Start() {
	s.c.Start()
	logger.Info("Scheduler started. Next run: %s", s.NextRun().Format("2006-01-02 15:04:05 MST"))
}

func (s *Scheduler) Stop() {
	ctx := s.c.Stop()
	<-ctx.Done()
}

func (s *Scheduler) NextRun() time.Time {
	entries := s.c.Entries()
	if len(entries) == 0 {
		return time.Time{}
	}
	return entries[0].Next
}

func (s *Scheduler) RunNow(ctx context.Context, job JobFunc) error {
	logger.Info("Running job immediately at %s", time.Now().In(s.loc).Format("2006-01-02 15:04:05 MST"))
	return job(ctx)
}
