package api

import (
	"net/http"

	"github.com/clipset/clipset-go/internal/api/handlers"
	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/services/auth"
	"github.com/clipset/clipset-go/internal/services/image"
	"github.com/clipset/clipset-go/internal/services/storage"
	"github.com/clipset/clipset-go/internal/services/upload"
)

// Router holds all HTTP handlers and dependencies
type Router struct {
	mux        *http.ServeMux
	db         *db.DB
	config     *config.Config
	jwtService *auth.JWTService

	// Handlers
	health     *handlers.HealthHandler
	auth       *handlers.AuthHandler
	users      *handlers.UsersHandler
	categories *handlers.CategoriesHandler
	videos     *handlers.VideosHandler
}

// NewRouter creates a new router with all dependencies
func NewRouter(database *db.DB, cfg *config.Config) *Router {
	// Create JWT service
	jwtService := auth.NewJWTService(cfg.JWTSecret, cfg.JWTExpiryHours)

	// Create shared image processor
	imgProcessor := image.NewProcessor(image.ProcessorConfig{
		TempPath:          cfg.TempStoragePath,
		AvatarPath:        cfg.AvatarStoragePath,
		CategoryImagePath: cfg.CategoryImageStoragePath,
		MaxAvatarSize:     cfg.MaxAvatarSizeBytes,
		MaxCategorySize:   cfg.MaxCategoryImageSizeBytes,
		AvatarSize:        cfg.AvatarImageSize,
		CategoryImageSize: cfg.CategoryImageSize,
	})

	// Ensure storage directories exist
	if err := imgProcessor.EnsureDirectories(); err != nil {
		panic("failed to create image directories: " + err.Error())
	}

	// Create video storage service
	videoStorage := storage.NewStorage(storage.StorageConfig{
		VideoPath:     cfg.VideoStoragePath,
		ThumbnailPath: cfg.ThumbnailStoragePath,
		TempPath:      cfg.TempStoragePath,
		ChunksPath:    cfg.ChunksStoragePath,
	})

	// Ensure video storage directories exist
	if err := videoStorage.EnsureDirectories(); err != nil {
		panic("failed to create video storage directories: " + err.Error())
	}

	// Create chunked upload manager
	chunkManager := upload.NewChunkedUploadManager(cfg.ChunksStoragePath)
	if err := chunkManager.EnsureBasePath(); err != nil {
		panic("failed to create chunks directory: " + err.Error())
	}

	r := &Router{
		mux:        http.NewServeMux(),
		db:         database,
		config:     cfg,
		jwtService: jwtService,
		health:     handlers.NewHealthHandler(),
		auth:       handlers.NewAuthHandler(database, jwtService),
		users:      handlers.NewUsersHandler(database, cfg, imgProcessor),
		categories: handlers.NewCategoriesHandler(database, cfg, imgProcessor),
		videos:     handlers.NewVideosHandler(database, cfg, videoStorage, chunkManager),
	}

	r.registerRoutes()
	return r
}

// VideosHandler returns the videos handler for external configuration
func (r *Router) VideosHandler() *handlers.VideosHandler {
	return r.videos
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

	// Category routes (authenticated)
	r.mux.Handle("GET /api/categories/", r.requireAuth(http.HandlerFunc(r.categories.List)))
	r.mux.Handle("GET /api/categories/{category_id}", r.requireAuth(http.HandlerFunc(r.categories.GetByID)))
	r.mux.Handle("GET /api/categories/slug/{slug}", r.requireAuth(http.HandlerFunc(r.categories.GetBySlug)))
	r.mux.Handle("GET /api/categories/{category_id}/image", r.requireAuth(http.HandlerFunc(r.categories.ServeImage)))

	// Category routes (admin only)
	r.mux.Handle("POST /api/categories/", r.requireAdmin(http.HandlerFunc(r.categories.Create)))
	r.mux.Handle("PATCH /api/categories/{category_id}", r.requireAdmin(http.HandlerFunc(r.categories.Update)))
	r.mux.Handle("DELETE /api/categories/{category_id}", r.requireAdmin(http.HandlerFunc(r.categories.Delete)))
	r.mux.Handle("POST /api/categories/{category_id}/image", r.requireAdmin(http.HandlerFunc(r.categories.UploadImage)))
	r.mux.Handle("DELETE /api/categories/{category_id}/image", r.requireAdmin(http.HandlerFunc(r.categories.DeleteImage)))

	// Video routes (authenticated)
	// Upload endpoints
	r.mux.Handle("POST /api/videos/upload", r.requireAuth(http.HandlerFunc(r.videos.Upload)))
	r.mux.Handle("POST /api/videos/upload/init", r.requireAuth(http.HandlerFunc(r.videos.InitChunkedUpload)))
	r.mux.Handle("POST /api/videos/upload/chunk", r.requireAuth(http.HandlerFunc(r.videos.UploadChunk)))
	r.mux.Handle("POST /api/videos/upload/complete", r.requireAuth(http.HandlerFunc(r.videos.CompleteChunkedUpload)))

	// Quota endpoints
	r.mux.Handle("GET /api/videos/quota/me", r.requireAuth(http.HandlerFunc(r.videos.GetMyQuota)))

	// Video CRUD endpoints
	r.mux.Handle("GET /api/videos/", r.requireAuth(http.HandlerFunc(r.videos.List)))
	r.mux.Handle("GET /api/videos/{short_id}", r.requireAuth(http.HandlerFunc(r.videos.GetByShortID)))
	r.mux.Handle("PATCH /api/videos/{short_id}", r.requireAuth(http.HandlerFunc(r.videos.Update)))
	r.mux.Handle("DELETE /api/videos/{short_id}", r.requireAuth(http.HandlerFunc(r.videos.Delete)))

	// Video streaming endpoints (Phase 7)
	r.mux.Handle("GET /api/videos/{short_id}/stream", r.requireAuth(http.HandlerFunc(r.videos.Stream)))
	r.mux.Handle("GET /api/videos/{short_id}/hls/{filename...}", r.requireAuth(http.HandlerFunc(r.videos.HLS)))
	r.mux.Handle("GET /api/videos/{short_id}/stream-info", r.requireAuth(http.HandlerFunc(r.videos.StreamInfo)))
	r.mux.Handle("GET /api/videos/{short_id}/thumbnail", r.requireAuth(http.HandlerFunc(r.videos.Thumbnail)))
	r.mux.Handle("POST /api/videos/{short_id}/view", r.requireAuth(http.HandlerFunc(r.videos.IncrementView)))

	// Video routes (admin only)
	r.mux.Handle("POST /api/videos/admin/quota/reset-all", r.requireAdmin(http.HandlerFunc(r.videos.ResetAllQuotas)))

	// TODO: Add more routes as handlers are implemented
	// Playlist routes
	// ...

	// Comment routes
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
