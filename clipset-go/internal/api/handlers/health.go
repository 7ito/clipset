package handlers

import (
	"net/http"

	"github.com/clipset/clipset-go/internal/api/response"
)

// HealthHandler handles health check endpoints
type HealthHandler struct{}

// NewHealthHandler creates a new health handler
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Health handles GET /api/health
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	response.OK(w, map[string]string{"status": "ok"})
}

// Root handles GET /
func (h *HealthHandler) Root(w http.ResponseWriter, r *http.Request) {
	response.OK(w, map[string]interface{}{
		"name":    "Clipset API",
		"version": "1.0.0",
		"status":  "running",
	})
}
