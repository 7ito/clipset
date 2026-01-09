package auth

import (
	"crypto/md5"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

// HLSDefaultExpiry is the default expiry time for HLS signed URLs (12 hours)
const HLSDefaultExpiry = 12 * time.Hour

// GenerateSignedHLSURL generates a signed URL for HLS segments compatible with nginx secure_link module.
//
// The nginx secure_link module expects URLs in the format:
//
//	/hls/path/to/segment.ts?md5=<hash>&expires=<timestamp>
//
// Where the hash is calculated as:
//
//	md5(expires + uri + " " + secret)
//
// The hash is then base64url encoded with padding stripped.
//
// Parameters:
//   - path: The path to the HLS file (e.g., "uuid_timestamp/segment000.ts")
//   - secret: The HLS signing secret
//   - expiresIn: Duration until the URL expires
//
// Returns the full signed URL path with query parameters.
func GenerateSignedHLSURL(path string, secret string, expiresIn time.Duration) string {
	expires := time.Now().Unix() + int64(expiresIn.Seconds())
	uri := fmt.Sprintf("/hls/%s", path)

	// Format: "{expires}{uri} {secret}" - note the space before secret
	// This matches nginx secure_link_md5 "$secure_link_expires$uri <secret>"
	toSign := fmt.Sprintf("%d%s %s", expires, uri, secret)

	// Calculate MD5 hash
	hash := md5.Sum([]byte(toSign))

	// Base64url encode (RFC 4648) and strip padding
	token := base64.URLEncoding.EncodeToString(hash[:])
	token = strings.TrimRight(token, "=")

	return fmt.Sprintf("%s?md5=%s&expires=%d", uri, token, expires)
}

// GenerateSignedHLSURLWithDefaults generates a signed URL using the default expiry time
func GenerateSignedHLSURLWithDefaults(path string, secret string) string {
	return GenerateSignedHLSURL(path, secret, HLSDefaultExpiry)
}

// ValidateHLSSignature validates an HLS signed URL (useful for testing)
// Returns true if the signature is valid and not expired
func ValidateHLSSignature(uri string, providedMD5 string, expires int64, secret string) bool {
	// Check if expired
	if time.Now().Unix() > expires {
		return false
	}

	// Recalculate expected hash
	toSign := fmt.Sprintf("%d%s %s", expires, uri, secret)
	hash := md5.Sum([]byte(toSign))
	expectedToken := base64.URLEncoding.EncodeToString(hash[:])
	expectedToken = strings.TrimRight(expectedToken, "=")

	return expectedToken == providedMD5
}
