package api

import (
	"net/http"

	"github.com/clipset/clipset-go/internal/api/handlers"
	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/services/auth"
)

// Router holds all HTTP handlers and dependencies
type Router struct {
	mux        *http.ServeMux
	db         *db.DB
	config     *config.Config
	jwtService *auth.JWTService

	// Handlers
	health *handlers.HealthHandler
	auth   *handlers.AuthHandler
	users  *handlers.UsersHandler
}

// NewRouter creates a new router with all dependencies
func NewRouter(database *db.DB, cfg *config.Config) *Router {
	// Create JWT service
	jwtService := auth.NewJWTService(cfg.JWTSecret, cfg.JWTExpiryHours)

	r := &Router{
		mux:        http.NewServeMux(),
		db:         database,
		config:     cfg,
		jwtService: jwtService,
		health:     handlers.NewHealthHandler(),
		auth:       handlers.NewAuthHandler(database, jwtService),
		users:      handlers.NewUsersHandler(database, cfg),
	}

	r.registerRoutes()
	return r
}

// registerRoutes registers all HTTP routes
func (r *Router) registerRoutes() {
	// Health endpoints (public)
	r.mux.HandleFunc("GET /", r.health.Root)
	r.mux.HandleFunc("GET /api/health", r.health.Health)

	// Auth routes (public)
	r.mux.HandleFunc("POST /api/auth/register", r.auth.Register)
	r.mux.HandleFunc("POST /api/auth/login", r.auth.Login)
	r.mux.HandleFunc("POST /api/auth/forgot-password", r.auth.ForgotPassword)
	r.mux.HandleFunc("GET /api/auth/verify-reset-token", r.auth.VerifyResetToken)
	r.mux.HandleFunc("POST /api/auth/reset-password", r.auth.ResetPassword)

	// Auth routes (authenticated)
	r.mux.Handle("GET /api/auth/me", r.requireAuth(http.HandlerFunc(r.auth.Me)))

	// User routes (admin only)
	r.mux.Handle("GET /api/users/", r.requireAdmin(http.HandlerFunc(r.users.List)))

	// User routes (authenticated)
	r.mux.Handle("GET /api/users/directory", r.requireAuth(http.HandlerFunc(r.users.Directory)))
	r.mux.Handle("GET /api/users/by-username/{username}", r.requireAuth(http.HandlerFunc(r.users.GetByUsername)))
	r.mux.Handle("GET /api/users/{user_id}", r.requireAuth(http.HandlerFunc(r.users.GetByID)))
	r.mux.Handle("POST /api/users/me/avatar", r.requireAuth(http.HandlerFunc(r.users.UploadAvatar)))
	r.mux.Handle("DELETE /api/users/me/avatar", r.requireAuth(http.HandlerFunc(r.users.DeleteAvatar)))

	// User routes (admin only - management)
	r.mux.Handle("DELETE /api/users/{user_id}", r.requireAdmin(http.HandlerFunc(r.users.Deactivate)))
	r.mux.Handle("POST /api/users/{user_id}/activate", r.requireAdmin(http.HandlerFunc(r.users.Activate)))
	r.mux.Handle("POST /api/users/{user_id}/generate-reset-link", r.requireAdmin(http.HandlerFunc(r.users.GenerateResetLink)))

	// TODO: Add more routes as handlers are implemented
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

// requireAuth wraps a handler with authentication middleware
func (r *Router) requireAuth(handler http.Handler) http.Handler {
	return middleware.Auth(r.jwtService)(handler)
}

// requireAdmin wraps a handler with authentication and admin middleware
func (r *Router) requireAdmin(handler http.Handler) http.Handler {
	return middleware.Auth(r.jwtService)(middleware.AdminOnly(handler))
}

// Handler returns the HTTP handler with all middleware applied
func (r *Router) Handler() http.Handler {
	var handler http.Handler = r.mux

	// Apply middleware (in reverse order)
	handler = middleware.CORS(r.config.CORSOrigins)(handler)
	handler = middleware.Logging(handler)

	return handler
}
