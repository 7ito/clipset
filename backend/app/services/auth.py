from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from typing import Optional
from app.models.user import User
from app.models.invitation import Invitation
from app.utils.security import verify_password, hash_password


async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
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
    db: AsyncSession,
    email: str,
    username: str,
    password: str,
    role: str = "user"
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
        role=role
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
    invitation.used_at = datetime.utcnow()
    await db.commit()


async def check_user_exists(db: AsyncSession, email: str = None, username: str = None) -> bool:
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
