from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    
    @field_validator('email')
    @classmethod
    def email_to_lowercase(cls, v: str) -> str:
        """Convert email to lowercase for case-insensitive uniqueness."""
        return v.lower()
    
    @field_validator('username')
    @classmethod
    def username_to_lowercase(cls, v: str) -> str:
        """Convert username to lowercase for case-insensitive uniqueness."""
        return v.lower()


class UserCreate(UserBase):
    password: str = Field(min_length=8)
    invitation_token: str


class UserUpdate(BaseModel):
    """For future user updates (all optional)."""
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')


class UserResponse(UserBase):
    """Public user response without sensitive data."""
    id: str
    role: str
    created_at: datetime
    is_active: bool
    
    class Config:
        from_attributes = True


class UserWithQuota(UserResponse):
    """User response including quota information (for own profile)."""
    weekly_upload_bytes: int
    last_upload_reset: datetime


class UserProfile(BaseModel):
    """Public profile view (for other users)."""
    id: str
    username: str
    created_at: datetime
    
    class Config:
        from_attributes = True
