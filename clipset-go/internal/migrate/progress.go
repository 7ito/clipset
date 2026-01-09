package migrate

import (
	"fmt"
	"strings"
	"time"
)

// Progress tracks migration progress for a table
type Progress struct {
	Table     string
	Total     int64
	Migrated  int64
	StartTime time.Time
}

// Start initializes progress tracking for a table
func (p *Progress) Start(table string, total int64) {
	p.Table = table
	p.Total = total
	p.Migrated = 0
	p.StartTime = time.Now()
}

// Update updates the progress count and prints status
func (p *Progress) Update(migrated int64) {
	p.Migrated = migrated
	p.print(false)
}

// Complete finalizes progress for a table
func (p *Progress) Complete() {
	p.Migrated = p.Total
	p.print(true)
	fmt.Println()
}

// print outputs the current progress
func (p *Progress) print(complete bool) {
	if p.Total == 0 {
		return
	}

	percent := float64(p.Migrated) / float64(p.Total) * 100
	elapsed := time.Since(p.StartTime)

	// Create progress bar (10 segments)
	filled := int(percent / 10)
	bar := strings.Repeat("=", filled) + strings.Repeat(" ", 10-filled)

	status := ""
	if complete {
		status = fmt.Sprintf("\r  %-17s [%s] %s/%s (%.0f%%) - %.1fs",
			p.Table,
			bar,
			formatNumber(p.Migrated),
			formatNumber(p.Total),
			percent,
			elapsed.Seconds())
	} else {
		status = fmt.Sprintf("\r  %-17s [%s] %s/%s (%.0f%%)",
			p.Table,
			bar,
			formatNumber(p.Migrated),
			formatNumber(p.Total),
			percent)
	}

	fmt.Print(status)
}

// MigrationResult holds the result of migrating a single table
type MigrationResult struct {
	Table    string
	Rows     int64
	Duration time.Duration
	Skipped  bool
	Error    error
}

// MigrationSummary holds all migration results
type MigrationSummary struct {
	Results   []MigrationResult
	StartTime time.Time
	EndTime   time.Time
}

// NewSummary creates a new migration summary
func NewSummary() *MigrationSummary {
	return &MigrationSummary{
		Results:   make([]MigrationResult, 0),
		StartTime: time.Now(),
	}
}

// Add adds a result to the summary
func (s *MigrationSummary) Add(result MigrationResult) {
	s.Results = append(s.Results, result)
}

// Finish marks the migration as complete
func (s *MigrationSummary) Finish() {
	s.EndTime = time.Now()
}

// TotalRows returns the total number of migrated rows
func (s *MigrationSummary) TotalRows() int64 {
	var total int64
	for _, r := range s.Results {
		if !r.Skipped {
			total += r.Rows
		}
	}
	return total
}

// TotalDuration returns the total migration duration
func (s *MigrationSummary) TotalDuration() time.Duration {
	return s.EndTime.Sub(s.StartTime)
}

// Print prints the migration summary
func (s *MigrationSummary) Print() {
	fmt.Println()
	fmt.Println("Migration completed successfully!")
	fmt.Println("=====================================")
	fmt.Printf("Total rows migrated: %s\n", formatNumber(s.TotalRows()))
	fmt.Printf("Total time: %.1fs\n", s.TotalDuration().Seconds())
}

// PrintDryRun prints what would be migrated
func PrintDryRun(counts map[string]int64) {
	fmt.Println()
	fmt.Println("Would migrate:")

	tables := []string{
		"users", "config", "invitations", "categories",
		"videos", "playlists", "playlist_videos", "comments",
	}

	for _, table := range tables {
		count := counts[table]
		if table == "config" {
			fmt.Printf("  %-17s %s row (update)\n", table+":", formatNumber(count))
		} else {
			fmt.Printf("  %-17s %s rows\n", table+":", formatNumber(count))
		}
	}

	// Show skipped table
	if count, ok := counts["password_reset_tokens"]; ok && count > 0 {
		fmt.Printf("\n  [SKIP] password_reset_tokens: %s rows (ephemeral data)\n", formatNumber(count))
	}

	var total int64
	for table, count := range counts {
		if table != "password_reset_tokens" {
			total += count
		}
	}

	fmt.Printf("\nTotal: %s rows would be migrated\n", formatNumber(total))
	fmt.Println("\nNo changes made (dry run).")
}

// formatNumber formats a number with commas for readability
func formatNumber(n int64) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}

	str := fmt.Sprintf("%d", n)
	var result strings.Builder
	length := len(str)

	for i, c := range str {
		if i > 0 && (length-i)%3 == 0 {
			result.WriteRune(',')
		}
		result.WriteRune(c)
	}

	return result.String()
}

// PrintHeader prints the migration header
func PrintHeader(dryRun bool) {
	if dryRun {
		fmt.Println("Clipset SQLite -> PostgreSQL Migration (DRY RUN)")
	} else {
		fmt.Println("Clipset SQLite -> PostgreSQL Migration")
	}
	fmt.Println("=====================================")
	fmt.Println()
}

// PrintConnecting prints connection status
func PrintConnecting() {
	fmt.Println("Connecting to databases...")
}

// PrintConnected prints successful connection
func PrintConnected(dbType, path string) {
	fmt.Printf("  %-11s %s\n", dbType+":", path)
}

// PrintCheckingTables prints table checking status
func PrintCheckingTables() {
	fmt.Println()
	fmt.Println("Checking PostgreSQL tables are empty...")
}

// PrintTableStatus prints the status of a table check
func PrintTableStatus(table string, empty bool) {
	status := "empty"
	if table == "config" && empty {
		status = "default row only"
	}
	if !empty {
		status = "HAS DATA"
	}
	fmt.Printf("  %-17s %s\n", table+":", status)
}

// PrintMigrating prints the migration start header
func PrintMigrating() {
	fmt.Println()
	fmt.Println("Migrating data...")
	fmt.Println()
}

// PrintSkipped prints a skipped table message
func PrintSkipped(table, reason string) {
	fmt.Printf("\n  [SKIPPED] %s (%s)\n", table, reason)
}

// PrintError prints an error message
func PrintError(table string, err error) {
	fmt.Printf("\n\nError: failed to migrate %s: %v\n", table, err)
	fmt.Println("\nMigration aborted. No partial changes committed.")
}
