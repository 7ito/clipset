package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/clipset/clipset-go/internal/domain"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token has expired")
)

// TokenClaims represents the claims in a JWT token
type TokenClaims struct {
	UserID   uuid.UUID       `json:"user_id"`
	Username string          `json:"username"`
	Role     domain.UserRole `json:"role"`
	jwt.RegisteredClaims
}

// JWTService handles JWT token operations
type JWTService struct {
	secret     []byte
	expiration time.Duration
}

// NewJWTService creates a new JWT service
func NewJWTService(secret string, expiration time.Duration) *JWTService {
	return &JWTService{
		secret:     []byte(secret),
		expiration: expiration,
	}
}

// GenerateToken creates a new JWT token for a user
func (s *JWTService) GenerateToken(userID uuid.UUID, username string, role domain.UserRole) (string, error) {
	now := time.Now()
	claims := TokenClaims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.expiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// ValidateToken validates a JWT token and returns the claims
func (s *JWTService) ValidateToken(tokenString string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.secret, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// GetExpiration returns the token expiration duration
func (s *JWTService) GetExpiration() time.Duration {
	return s.expiration
}
