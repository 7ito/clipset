from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional
from app.schemas.base import BaseResponse


class InvitationCreate(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def email_to_lowercase(cls, v: str) -> str:
        """Convert email to lowercase for consistency."""
        return v.lower()


class InvitationResponse(BaseResponse):
    id: str
    email: str
    token: str
    created_by: str
    created_at: datetime
    expires_at: datetime
    used: bool
    used_at: Optional[datetime]


class InvitationWithLink(InvitationResponse):
    """Invitation response with full invitation link."""

    invitation_link: str


class InvitationValidation(BaseModel):
    """Response for invitation token validation."""

    valid: bool
    email: Optional[str] = None
    message: Optional[str] = None
