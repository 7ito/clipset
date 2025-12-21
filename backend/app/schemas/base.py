from datetime import datetime, timezone
from pydantic import BaseModel, model_validator
from typing import Any


class BaseResponse(BaseModel):
    """Base schema for responses ensuring UTC datetimes."""

    @model_validator(mode="after")
    def ensure_utc_v2(self) -> "BaseResponse":
        """Ensure all datetime fields are timezone-aware UTC."""
        for field_name, field_value in self.__dict__.items():
            if isinstance(field_value, datetime):
                if field_value.tzinfo is None:
                    setattr(self, field_name, field_value.replace(tzinfo=timezone.utc))
                else:
                    setattr(self, field_name, field_value.astimezone(timezone.utc))
        return self

    model_config = {"from_attributes": True}
