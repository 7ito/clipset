import logging
from app.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(email: str, token: str):
    """
    Simulate sending a password reset email by logging it to the console.
    In the future, this can be updated to use a real SMTP service.
    """
    reset_link = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token}"

    msg = f"""
{"=" * 80}
PASSWORD RESET REQUESTED
{"=" * 80}
User Email: {email}
Reset Link: {reset_link}

Copy and paste the link above into your browser to reset your password.
This link will expire in 1 hour.
{"=" * 80}
"""
    # Print to console for the user to see in Docker logs
    print(msg)

    # Also log it
    logger.info(f"Password reset link generated for {email}")
