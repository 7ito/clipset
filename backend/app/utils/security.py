import bcrypt
import hashlib
import base64
import time
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
import secrets
from app.config import settings


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing user data (user_id, username, role)
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict]:
    """
    Decode and validate a JWT access token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload or None if invalid
    """
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def generate_url_safe_token(length: int = 32) -> str:
    """
    Generate a URL-safe random token for invitations.

    Args:
        length: Number of bytes to generate (default 32)

    Returns:
        URL-safe random string
    """
    return secrets.token_urlsafe(length)


def generate_signed_hls_url(path: str, expires_in: int = 43200) -> str:
    """
    Generate a signed URL for nginx secure_link validation.

    This creates URLs that nginx can validate without involving Python,
    enabling direct file serving with kernel-level sendfile() for optimal
    HLS streaming performance.

    The signature format is compatible with nginx secure_link_md5:
        secure_link_md5 "$secure_link_expires$uri <secret>"

    Note: A space before the secret is required because nginx cannot parse
    "$uri<secret>" as two separate parts without a delimiter.

    Args:
        path: The file path relative to videos directory (e.g., "video-uuid/segment000.ts")
        expires_in: Seconds until expiry (default 12 hours = 43200 seconds)

    Returns:
        Signed URL like "/hls/video-uuid/segment000.ts?md5=xxx&expires=yyy"
    """
    expires = int(time.time()) + expires_in
    uri = f"/hls/{path}"

    # nginx secure_link_md5 expects: expires + uri + space + secret
    # The space is needed because nginx config has: "$secure_link_expires$uri __HLS_SECRET__"
    # Without a space, nginx would interpret "$uri<secret>" as a single variable name
    secret = settings.hls_signing_secret
    to_sign = f"{expires}{uri} {secret}"

    # Calculate MD5 hash
    md5_hash = hashlib.md5(to_sign.encode()).digest()

    # nginx expects base64url encoding (RFC 4648):
    # - Replace + with -
    # - Replace / with _
    # - Strip padding (=)
    token = base64.urlsafe_b64encode(md5_hash).decode().rstrip("=")

    return f"{uri}?md5={token}&expires={expires}"
