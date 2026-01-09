package migrate

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Options holds the migration configuration
type Options struct {
	SQLitePath  string
	PostgresURL string
	DryRun      bool
	BatchSize   int
}

// DefaultBatchSize is the default number of rows per batch
const DefaultBatchSize = 1000

// Tables that should be skipped during empty check (managed by other systems)
var skipTables = map[string]bool{
	"river_job":         true, // River queue
	"river_leader":      true, // River leader election
	"river_migration":   true, // River migrations
	"schema_migrations": true, // golang-migrate tracking
}

// Application tables to migrate (in dependency order)
var appTables = []string{
	"users",
	"config",
	"invitations",
	"categories",
	"videos",
	"playlists",
	"playlist_videos",
	"comments",
}

// Run executes the migration
func Run(ctx context.Context, opts Options) error {
	if opts.BatchSize <= 0 {
		opts.BatchSize = DefaultBatchSize
	}

	PrintHeader(opts.DryRun)
	PrintConnecting()

	// Connect to SQLite
	sqlite, err := ConnectSQLite(opts.SQLitePath)
	if err != nil {
		return fmt.Errorf("SQLite connection failed: %w", err)
	}
	defer sqlite.Close()
	PrintConnected("SQLite", opts.SQLitePath+" (read-only)")

	// Connect to PostgreSQL
	pgConfig, err := pgxpool.ParseConfig(opts.PostgresURL)
	if err != nil {
		return fmt.Errorf("failed to parse PostgreSQL URL: %w", err)
	}

	// Use smaller pool for migration
	pgConfig.MaxConns = 5
	pgConfig.MinConns = 1

	pg, err := pgxpool.NewWithConfig(ctx, pgConfig)
	if err != nil {
		return fmt.Errorf("PostgreSQL connection failed: %w", err)
	}
	defer pg.Close()

	// Verify connection
	if err := pg.Ping(ctx); err != nil {
		return fmt.Errorf("PostgreSQL ping failed: %w", err)
	}

	// Mask password in URL for display
	displayURL := maskPassword(opts.PostgresURL)
	PrintConnected("PostgreSQL", displayURL)

	// Check PostgreSQL tables are empty
	PrintCheckingTables()
	if err := checkEmptyTables(ctx, pg); err != nil {
		return err
	}

	// Get counts from SQLite
	counts, err := sqlite.GetAllCounts(ctx)
	if err != nil {
		return fmt.Errorf("failed to get SQLite counts: %w", err)
	}

	// Dry run: just show what would be migrated
	if opts.DryRun {
		PrintDryRun(counts)
		return nil
	}

	// Run the actual migration
	return runMigration(ctx, sqlite, pg, opts, counts)
}

// checkEmptyTables verifies that PostgreSQL application tables are empty
func checkEmptyTables(ctx context.Context, pg *pgxpool.Pool) error {
	for _, table := range appTables {
		// Config table is special - it has a default row
		if table == "config" {
			count, err := countPGTable(ctx, pg, table)
			if err != nil {
				return err
			}
			// Config should have exactly 1 row (the default)
			if count > 1 {
				PrintTableStatus(table, false)
				return fmt.Errorf("table %s has %d rows (expected 0 or 1)", table, count)
			}
			PrintTableStatus(table, true)
			continue
		}

		count, err := countPGTable(ctx, pg, table)
		if err != nil {
			return err
		}
		if count > 0 {
			PrintTableStatus(table, false)
			return fmt.Errorf("table %s is not empty (has %d rows)", table, count)
		}
		PrintTableStatus(table, true)
	}

	return nil
}

// countPGTable returns the row count for a PostgreSQL table
func countPGTable(ctx context.Context, pg *pgxpool.Pool, table string) (int64, error) {
	var count int64
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s", table)
	err := pg.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count %s: %w", table, err)
	}
	return count, nil
}

// runMigration performs the actual data migration
func runMigration(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, opts Options, counts map[string]int64) error {
	PrintMigrating()

	summary := NewSummary()
	progress := &Progress{}

	// 1. Migrate users
	rows, err := MigrateUsers(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("users", err)
		return err
	}
	summary.Add(MigrationResult{Table: "users", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 2. Migrate config (UPDATE only)
	configStart := time.Now()
	if err := MigrateConfig(ctx, sqlite, pg, opts.DryRun, progress); err != nil {
		PrintError("config", err)
		return err
	}
	configRows := int64(0)
	if counts["config"] > 0 {
		configRows = 1
	}
	summary.Add(MigrationResult{Table: "config", Rows: configRows, Duration: time.Since(configStart)})

	// 3. Migrate invitations
	rows, err = MigrateInvitations(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("invitations", err)
		return err
	}
	summary.Add(MigrationResult{Table: "invitations", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 4. Migrate categories
	rows, err = MigrateCategories(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("categories", err)
		return err
	}
	summary.Add(MigrationResult{Table: "categories", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 5. Migrate videos
	rows, err = MigrateVideos(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("videos", err)
		return err
	}
	summary.Add(MigrationResult{Table: "videos", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 6. Migrate playlists
	rows, err = MigratePlaylists(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("playlists", err)
		return err
	}
	summary.Add(MigrationResult{Table: "playlists", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 7. Migrate playlist_videos
	rows, err = MigratePlaylistVideos(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("playlist_videos", err)
		return err
	}
	summary.Add(MigrationResult{Table: "playlist_videos", Rows: rows, Duration: time.Since(progress.StartTime)})

	// 8. Migrate comments
	rows, err = MigrateComments(ctx, sqlite, pg, opts.BatchSize, opts.DryRun, progress)
	if err != nil {
		PrintError("comments", err)
		return err
	}
	summary.Add(MigrationResult{Table: "comments", Rows: rows, Duration: time.Since(progress.StartTime)})

	// Print skipped table
	if prtCount := counts["password_reset_tokens"]; prtCount > 0 {
		PrintSkipped("password_reset_tokens", "ephemeral data")
	}

	// Verify migration
	if err := verifyMigration(ctx, sqlite, pg); err != nil {
		return fmt.Errorf("migration verification failed: %w", err)
	}

	summary.Finish()
	summary.Print()

	return nil
}

// verifyMigration checks that row counts match between SQLite and PostgreSQL
func verifyMigration(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool) error {
	tables := []string{
		"users", "invitations", "categories", "videos",
		"playlists", "playlist_videos", "comments",
	}

	for _, table := range tables {
		var sqliteCount int64
		var pgCount int64
		var err error

		switch table {
		case "users":
			sqliteCount, err = sqlite.CountUsers(ctx)
		case "invitations":
			sqliteCount, err = sqlite.CountInvitations(ctx)
		case "categories":
			sqliteCount, err = sqlite.CountCategories(ctx)
		case "videos":
			sqliteCount, err = sqlite.CountVideos(ctx)
		case "playlists":
			sqliteCount, err = sqlite.CountPlaylists(ctx)
		case "playlist_videos":
			sqliteCount, err = sqlite.CountPlaylistVideos(ctx)
		case "comments":
			sqliteCount, err = sqlite.CountComments(ctx)
		}
		if err != nil {
			return fmt.Errorf("failed to count SQLite %s: %w", table, err)
		}

		pgCount, err = countPGTable(ctx, pg, table)
		if err != nil {
			return fmt.Errorf("failed to count PostgreSQL %s: %w", table, err)
		}

		if sqliteCount != pgCount {
			return fmt.Errorf("table %s: SQLite has %d rows, PostgreSQL has %d",
				table, sqliteCount, pgCount)
		}
	}

	return nil
}

// maskPassword replaces the password in a database URL with asterisks
func maskPassword(url string) string {
	// Simple masking - find :password@ pattern
	// This is a basic implementation; production code might use url.Parse
	start := -1
	end := -1
	colonCount := 0

	for i, c := range url {
		if c == ':' {
			colonCount++
			if colonCount == 2 {
				start = i + 1
			}
		}
		if c == '@' && start > 0 {
			end = i
			break
		}
	}

	if start > 0 && end > start {
		return url[:start] + "****" + url[end:]
	}

	return url
}
