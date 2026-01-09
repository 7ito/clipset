package response

import (
	"encoding/json"
	"net/http"
)

// JSON writes a JSON response with the given status code
func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
	}
}

// Error writes a JSON error response
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"detail": message})
}

// ErrorWithDetails writes a JSON error response with additional details
func ErrorWithDetails(w http.ResponseWriter, status int, message string, details map[string]interface{}) {
	resp := map[string]interface{}{
		"detail": message,
	}
	for k, v := range details {
		resp[k] = v
	}
	JSON(w, status, resp)
}

// OK writes a 200 OK JSON response
func OK(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, data)
}

// Created writes a 201 Created JSON response
func Created(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusCreated, data)
}

// NoContent writes a 204 No Content response
func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

// BadRequest writes a 400 Bad Request JSON error response
func BadRequest(w http.ResponseWriter, message string) {
	Error(w, http.StatusBadRequest, message)
}

// Unauthorized writes a 401 Unauthorized JSON error response
func Unauthorized(w http.ResponseWriter, message string) {
	Error(w, http.StatusUnauthorized, message)
}

// Forbidden writes a 403 Forbidden JSON error response
func Forbidden(w http.ResponseWriter, message string) {
	Error(w, http.StatusForbidden, message)
}

// NotFound writes a 404 Not Found JSON error response
func NotFound(w http.ResponseWriter, message string) {
	Error(w, http.StatusNotFound, message)
}

// Conflict writes a 409 Conflict JSON error response
func Conflict(w http.ResponseWriter, message string) {
	Error(w, http.StatusConflict, message)
}

// UnprocessableEntity writes a 422 Unprocessable Entity JSON error response
func UnprocessableEntity(w http.ResponseWriter, message string) {
	Error(w, http.StatusUnprocessableEntity, message)
}

// InternalServerError writes a 500 Internal Server Error JSON error response
func InternalServerError(w http.ResponseWriter, message string) {
	Error(w, http.StatusInternalServerError, message)
}

// ValidationError represents a validation error for a specific field
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrors writes a 422 response with validation errors
func ValidationErrors(w http.ResponseWriter, errors []ValidationError) {
	JSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
		"detail": "Validation failed",
		"errors": errors,
	})
}
