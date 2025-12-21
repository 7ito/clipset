from datetime import datetime, timezone
from pydantic import BaseModel, field_validator
from typing import Any


class BaseResponse(BaseModel):
    """Base schema for responses ensuring UTC datetimes."""

    @field_validator("*", mode="after")
    @classmethod
    def ensure_utc(cls, v: Any) -> Any:
        """Ensure all datetime fields are timezone-aware UTC."""
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return v

    model_config = {"from_attributes": True}
