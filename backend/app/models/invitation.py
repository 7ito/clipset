from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
import uuid
from app.database import Base


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime, nullable=True)

    # Relationships
    creator = relationship("User", back_populates="invitations")

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        return datetime.now(timezone.utc).replace(
            tzinfo=None
        ) > self.expires_at.replace(tzinfo=None)

    @property
    def is_valid(self) -> bool:
        """Check if invitation is valid (not used and not expired)."""
        return not self.used and not self.is_expired

    def __repr__(self):
        return f"<Invitation(id={self.id}, email={self.email}, used={self.used})>"
