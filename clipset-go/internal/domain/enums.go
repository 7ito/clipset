package domain

import (
	"database/sql/driver"
	"fmt"
)

// UserRole represents the role of a user
type UserRole string

const (
	UserRoleUser  UserRole = "user"
	UserRoleAdmin UserRole = "admin"
)

// Scan implements the sql.Scanner interface
func (r *UserRole) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		*r = UserRole(v)
	case []byte:
		*r = UserRole(string(v))
	default:
		return fmt.Errorf("cannot scan %T into UserRole", src)
	}
	return nil
}

// Value implements the driver.Valuer interface
func (r UserRole) Value() (driver.Value, error) {
	return string(r), nil
}

// IsValid checks if the role is valid
func (r UserRole) IsValid() bool {
	switch r {
	case UserRoleUser, UserRoleAdmin:
		return true
	}
	return false
}

// ProcessingStatus represents the status of video processing
type ProcessingStatus string

const (
	ProcessingStatusPending    ProcessingStatus = "pending"
	ProcessingStatusProcessing ProcessingStatus = "processing"
	ProcessingStatusCompleted  ProcessingStatus = "completed"
	ProcessingStatusFailed     ProcessingStatus = "failed"
)

// Scan implements the sql.Scanner interface
func (s *ProcessingStatus) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		*s = ProcessingStatus(v)
	case []byte:
		*s = ProcessingStatus(string(v))
	default:
		return fmt.Errorf("cannot scan %T into ProcessingStatus", src)
	}
	return nil
}

// Value implements the driver.Valuer interface
func (s ProcessingStatus) Value() (driver.Value, error) {
	return string(s), nil
}

// IsValid checks if the status is valid
func (s ProcessingStatus) IsValid() bool {
	switch s {
	case ProcessingStatusPending, ProcessingStatusProcessing, ProcessingStatusCompleted, ProcessingStatusFailed:
		return true
	}
	return false
}
