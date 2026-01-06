from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.models.user import User
from app.models.invitation import Invitation
from app.utils.security import verify_password, hash_password


import secrets
import hashlib
from app.models.password_reset import PasswordResetToken
from app.services.email import send_password_reset_email


async def authenticate_user(
    db: AsyncSession, username: str, password: str
) -> Optional[User]:
    """
    Authenticate a user by username and password.

    Args:
        db: Database session
        username: Username (case-insensitive)
        password: Plain text password

    Returns:
        User object if authentication successful, None otherwise
    """
    # Convert username to lowercase for case-insensitive lookup
    username_lower = username.lower()

    # Find user by username
    result = await db.execute(select(User).where(User.username == username_lower))
    user = result.scalar_one_or_none()

    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


async def create_user(
    db: AsyncSession, email: str, username: str, password: str, role: str = "user"
) -> User:
    """
    Create a new user.

    Args:
        db: Database session
        email: User email (will be converted to lowercase)
        username: Username (will be converted to lowercase)
        password: Plain text password (will be hashed)
        role: User role (default: "user")

    Returns:
        Created User object
    """
    # Normalize email and username to lowercase
    email_lower = email.lower()
    username_lower = username.lower()

    # Hash password
    password_hash = hash_password(password)

    # Create user
    user = User(
        email=email_lower,
        username=username_lower,
        password_hash=password_hash,
        role=role,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def validate_invitation(db: AsyncSession, token: str) -> Optional[Invitation]:
    """
    Validate an invitation token.

    Args:
        db: Database session
        token: Invitation token

    Returns:
        Invitation object if valid, None otherwise
    """
    # Find invitation by token
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    invitation = result.scalar_one_or_none()

    if not invitation:
        return None

    # Check if valid (not used and not expired)
    if not invitation.is_valid:
        return None

    return invitation


async def mark_invitation_used(db: AsyncSession, invitation: Invitation) -> None:
    """
    Mark an invitation as used.

    Args:
        db: Database session
        invitation: Invitation object to mark as used
    """
    invitation.used = True
    invitation.used_at = datetime.now(timezone.utc)
    await db.commit()


async def check_user_exists(
    db: AsyncSession, email: str = None, username: str = None
) -> bool:
    """
    Check if a user with given email or username already exists.

    Args:
        db: Database session
        email: Email to check (case-insensitive)
        username: Username to check (case-insensitive)

    Returns:
        True if user exists, False otherwise
    """
    if email:
        email_lower = email.lower()
        result = await db.execute(select(User).where(User.email == email_lower))
        if result.scalar_one_or_none():
            return True

    if username:
        username_lower = username.lower()
        result = await db.execute(select(User).where(User.username == username_lower))
        if result.scalar_one_or_none():
            return True

    return False


async def create_password_reset_token(db: AsyncSession, email: str) -> bool:
    """
    Generate a password reset token for the user with the given email.
    The raw token is "sent" via email (console), while the hash is stored.
    """
    # Find user
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal if user exists for security
        return True

    # Delete any existing tokens for this user
    # result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    # ... actually we can just leave them or delete them. For simplicity, let's just create a new one.

    # Generate token
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Create record
    expires_at = datetime.utcnow() + timedelta(hours=1)
    reset_token = PasswordResetToken(
        user_id=user.id, token_hash=token_hash, expires_at=expires_at
    )

    db.add(reset_token)
    await db.commit()

    # Send "email"
    send_password_reset_email(user.email, token)

    return True


async def admin_generate_password_reset_link(
    db: AsyncSession, user_id: str
) -> tuple[str, datetime] | None:
    """
    Generate a password reset token for a user (admin action).
    Returns the raw token and expiration time instead of logging it.

    Args:
        db: Database session
        user_id: The user ID to generate reset link for

    Returns:
        Tuple of (token, expires_at) if successful, None if user not found
    """
    # Find user by ID
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return None

    # Generate token
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Create record with 24-hour expiration for admin-generated links
    expires_at = datetime.utcnow() + timedelta(hours=24)
    reset_token = PasswordResetToken(
        user_id=user.id, token_hash=token_hash, expires_at=expires_at
    )

    db.add(reset_token)
    await db.commit()

    return token, expires_at


async def reset_password_with_token(
    db: AsyncSession, token: str, new_password: str
) -> bool:
    """
    Verify the token and update the user's password.
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Find token
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    reset_token = result.scalar_one_or_none()

    if not reset_token:
        return False

    # Check expiry
    if reset_token.is_expired():
        await db.delete(reset_token)
        await db.commit()
        return False

    # Find user
    result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = result.scalar_one_or_none()

    if not user:
        return False

    # Update password
    user.password_hash = hash_password(new_password)

    # Delete token
    await db.delete(reset_token)

    await db.commit()

    return True
