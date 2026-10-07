package logger
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung
import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

var levelNames = map[Level]string{
	DEBUG: "DEBUG",
	INFO:  "INFO",
	WARN:  "WARN",
	ERROR: "ERROR",
}

type Logger struct {
	level    Level
	stdLog   *log.Logger
	fileLog  *log.Logger
	logFile  *os.File
	logDir   string
}

var defaultLogger *Logger

func Init(logDir string, level Level) error {
	l, err := New(logDir, level)
	if err != nil {
		return err
	}
	defaultLogger = l
	return nil
}

func New(logDir string, level Level) (*Logger, error) {
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("creating log dir: %w", err)
	}

	dateStr := time.Now().Format("2006-01-02")
	logPath := filepath.Join(logDir, fmt.Sprintf("crash-monitor-%s.log", dateStr))

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("opening log file: %w", err)
	}

	mw := io.MultiWriter(os.Stdout, f)
	flags := log.Ldate | log.Ltime

	return &Logger{
		level:   level,
		stdLog:  log.New(mw, "", flags),
		fileLog: log.New(f, "", flags),
		logFile: f,
		logDir:  logDir,
	}, nil
}
// đitcumay
func (l *Logger) Close() {
	if l.logFile != nil {
		_ = l.logFile.Close()
	}
}

func (l *Logger) log(level Level, format string, args ...interface{}) {
	if level < l.level {
		return
	}
	prefix := fmt.Sprintf("[%s] ", levelNames[level])
	msg := fmt.Sprintf(format, args...)
	l.stdLog.Printf("%s%s", prefix, msg)
}

func (l *Logger) Info(format string, args ...interface{}) {
	l.log(INFO, format, args...)
}

func (l *Logger) Warn(format string, args ...interface{}) {
	l.log(WARN, format, args...)
}

func (l *Logger) Error(format string, args ...interface{}) {
	l.log(ERROR, format, args...)
}

func (l *Logger) Debug(format string, args ...interface{}) {
	l.log(DEBUG, format, args...)
}

func (l *Logger) Separator() {
	l.stdLog.Printf("----------------------------------------")
}

func Info(format string, args ...interface{})  { defaultLogger.Info(format, args...) }
func Warn(format string, args ...interface{})  { defaultLogger.Warn(format, args...) }
func Error(format string, args ...interface{}) { defaultLogger.Error(format, args...) }
func Debug(format string, args ...interface{}) { defaultLogger.Debug(format, args...) }
func Separator()                               { defaultLogger.Separator() }
func Close()                                   { defaultLogger.Close() }
//chuc hai chu kenh mien tay tuoi dep va tom lai la tin tuc ra duong bi xe dung