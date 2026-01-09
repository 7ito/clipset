package api

import (
	"net/http"

	"github.com/clipset/clipset-go/internal/api/handlers"
	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
)

// Router holds all HTTP handlers and dependencies
type Router struct {
	mux    *http.ServeMux
	db     *db.DB
	config *config.Config

	// Handlers
	health *handlers.HealthHandler
}

// NewRouter creates a new router with all dependencies
func NewRouter(database *db.DB, cfg *config.Config) *Router {
	r := &Router{
		mux:    http.NewServeMux(),
		db:     database,
		config: cfg,
		health: handlers.NewHealthHandler(),
	}

	r.registerRoutes()
	return r
}

// registerRoutes registers all HTTP routes
func (r *Router) registerRoutes() {
	// Health endpoints
	r.mux.HandleFunc("GET /", r.health.Root)
	r.mux.HandleFunc("GET /api/health", r.health.Health)

	// TODO: Add more routes as handlers are implemented
	// Auth routes
	// r.mux.HandleFunc("POST /api/auth/register", r.auth.Register)
	// r.mux.HandleFunc("POST /api/auth/login", r.auth.Login)
	// r.mux.HandleFunc("GET /api/auth/me", r.auth.Me)

	// User routes
	// r.mux.HandleFunc("GET /api/users/", r.users.List)
	// ...

	// Video routes
	// ...

	// Playlist routes
	// ...

	// Comment routes
	// ...

	// Category routes
	// ...

	// Invitation routes
	// ...

	// Config routes
	// ...
}

// Handler returns the HTTP handler with all middleware applied
func (r *Router) Handler() http.Handler {
	var handler http.Handler = r.mux

	// Apply middleware (in reverse order)
	handler = middleware.CORS(r.config.CORSOrigins)(handler)
	handler = middleware.Logging(handler)

	return handler
}
