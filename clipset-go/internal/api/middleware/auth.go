package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/domain"
	"github.com/clipset/clipset-go/internal/services/auth"
)

// Context keys for user information
type contextKey string

const (
	UserIDKey     contextKey = "user_id"
	UsernameKey   contextKey = "username"
	UserRoleKey   contextKey = "user_role"
	UserClaimsKey contextKey = "user_claims"
)

// Auth creates authentication middleware
func Auth(jwtService *auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token == "" {
				response.Unauthorized(w, "Missing authentication token")
				return
			}

			claims, err := jwtService.ValidateToken(token)
			if err != nil {
				if err == auth.ErrExpiredToken {
					response.Unauthorized(w, "Token has expired")
					return
				}
				response.Unauthorized(w, "Invalid token")
				return
			}

			// Add user info to context
			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			ctx = context.WithValue(ctx, UsernameKey, claims.Username)
			ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
			ctx = context.WithValue(ctx, UserClaimsKey, claims)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth creates optional authentication middleware
// Allows unauthenticated requests but adds user info if token is present
func OptionalAuth(jwtService *auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token != "" {
				claims, err := jwtService.ValidateToken(token)
				if err == nil {
					ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
					ctx = context.WithValue(ctx, UsernameKey, claims.Username)
					ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
					ctx = context.WithValue(ctx, UserClaimsKey, claims)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AdminOnly creates middleware that requires admin role
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := r.Context().Value(UserRoleKey).(domain.UserRole)
		if !ok || role != domain.UserRoleAdmin {
			response.Forbidden(w, "Admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// extractToken extracts the JWT token from the request
// Supports both Authorization header and query parameter
func extractToken(r *http.Request) string {
	// Try Authorization header first
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		// Bearer token format
		if strings.HasPrefix(authHeader, "Bearer ") {
			return strings.TrimPrefix(authHeader, "Bearer ")
		}
		return authHeader
	}

	// Fall back to query parameter (for video streaming)
	return r.URL.Query().Get("token")
}

// GetUserID extracts the user ID from the context
func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(UserIDKey).(uuid.UUID)
	return userID, ok
}

// GetUsername extracts the username from the context
func GetUsername(ctx context.Context) (string, bool) {
	username, ok := ctx.Value(UsernameKey).(string)
	return username, ok
}

// GetUserRole extracts the user role from the context
func GetUserRole(ctx context.Context) (domain.UserRole, bool) {
	role, ok := ctx.Value(UserRoleKey).(domain.UserRole)
	return role, ok
}

// GetUserClaims extracts the full claims from the context
func GetUserClaims(ctx context.Context) (*auth.TokenClaims, bool) {
	claims, ok := ctx.Value(UserClaimsKey).(*auth.TokenClaims)
	return claims, ok
}

// IsAdmin checks if the current user is an admin
func IsAdmin(ctx context.Context) bool {
	role, ok := GetUserRole(ctx)
	return ok && role == domain.UserRoleAdmin
}

// IsAuthenticated checks if the request has a valid authentication
func IsAuthenticated(ctx context.Context) bool {
	_, ok := GetUserID(ctx)
	return ok
}
