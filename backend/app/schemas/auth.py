from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_to_lowercase(cls, v: str) -> str:
        """Convert username to lowercase for case-insensitive login."""
        return v.lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8)
    invitation_token: str

    @field_validator("email")
    @classmethod
    def email_to_lowercase(cls, v: str) -> str:
        """Convert email to lowercase for case-insensitive uniqueness."""
        return v.lower()

    @field_validator("username")
    @classmethod
    def username_to_lowercase(cls, v: str) -> str:
        """Convert username to lowercase for case-insensitive uniqueness."""
        return v.lower()


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class PasswordResetLinkResponse(BaseModel):
    reset_link: str
    expires_at: str


class ResetTokenVerifyResponse(BaseModel):
    username: str
