// Package migrate provides SQLite to PostgreSQL data migration functionality.
package migrate

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Timestamp formats that SQLite/Python may use
var timestampFormats = []string{
	time.RFC3339Nano,                   // 2006-01-02T15:04:05.999999999Z07:00
	time.RFC3339,                       // 2006-01-02T15:04:05Z07:00
	"2006-01-02T15:04:05.999999",       // Microseconds without TZ
	"2006-01-02T15:04:05.999999999",    // Nanoseconds without TZ
	"2006-01-02T15:04:05",              // Without timezone
	"2006-01-02 15:04:05.999999",       // Space separator with microseconds
	"2006-01-02 15:04:05",              // Space separator
	"2006-01-02T15:04:05.999999+00:00", // With explicit UTC offset
}

// ParseUUID converts a SQLite string UUID to google/uuid.UUID
func ParseUUID(s string) (uuid.UUID, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return uuid.UUID{}, fmt.Errorf("empty UUID string")
	}

	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("invalid UUID format %q: %w", s, err)
	}

	return id, nil
}

// ParseNullableUUID converts a nullable SQLite string UUID to *uuid.UUID
func ParseNullableUUID(s *string) (*uuid.UUID, error) {
	if s == nil || *s == "" {
		return nil, nil
	}

	id, err := ParseUUID(*s)
	if err != nil {
		return nil, err
	}

	return &id, nil
}

// ParseTimestamp converts a SQLite ISO8601 string to time.Time (UTC)
func ParseTimestamp(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty timestamp string")
	}

	for _, format := range timestampFormats {
		if t, err := time.Parse(format, s); err == nil {
			return t.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("unable to parse timestamp %q", s)
}

// ParseNullableTimestamp converts a nullable SQLite timestamp to *time.Time
func ParseNullableTimestamp(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}

	t, err := ParseTimestamp(*s)
	if err != nil {
		return nil, err
	}

	return &t, nil
}

// NormalizeEmail converts email to lowercase and trims whitespace
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// NormalizeUsername converts username to lowercase and trims whitespace
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// ValidUserRoles are the allowed user role values
var ValidUserRoles = map[string]bool{
	"user":  true,
	"admin": true,
}

// ConvertUserRole validates and returns the user role
func ConvertUserRole(role string) (string, error) {
	role = strings.ToLower(strings.TrimSpace(role))
	if !ValidUserRoles[role] {
		return "", fmt.Errorf("invalid user role %q", role)
	}
	return role, nil
}

// ValidProcessingStatuses are the allowed processing status values
var ValidProcessingStatuses = map[string]bool{
	"pending":    true,
	"processing": true,
	"completed":  true,
	"failed":     true,
}

// ConvertProcessingStatus validates and returns the processing status
func ConvertProcessingStatus(status string) (string, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	if !ValidProcessingStatuses[status] {
		return "", fmt.Errorf("invalid processing status %q", status)
	}
	return status, nil
}

// NullableString converts a potentially empty string pointer to a proper nullable
func NullableString(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

// NullableInt32 converts a potentially nil int pointer
func NullableInt32(i *int) *int32 {
	if i == nil {
		return nil
	}
	v := int32(*i)
	return &v
}

// NullableInt64 converts a potentially nil int64 pointer
func NullableInt64(i *int64) *int64 {
	if i == nil {
		return nil
	}
	return i
}
