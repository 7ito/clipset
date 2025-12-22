from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from app.api.deps import get_db, require_admin
from app.schemas.invitation import (
    InvitationCreate,
    InvitationResponse,
    InvitationWithLink,
    InvitationValidation,
)
from app.models.invitation import Invitation
from app.models.user import User
from app.utils.security import generate_url_safe_token
from app.config import settings

router = APIRouter()


@router.post("/", response_model=InvitationWithLink, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    request: InvitationCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new invitation (admin only).

    - **email**: Email address to invite
    - Returns invitation with full registration link
    """
    # Generate unique token
    token = generate_url_safe_token(32)

    # Set expiration (7 days from now)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Create invitation
    invitation = Invitation(
        email=request.email,
        token=token,
        created_by=current_user.id,
        expires_at=expires_at,
    )

    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Generate invitation link
    invitation_link = f"{settings.FRONTEND_BASE_URL}/register/{token}"

    # Return with link
    return InvitationWithLink(**invitation.__dict__, invitation_link=invitation_link)


@router.get("/", response_model=list[InvitationResponse])
async def list_invitations(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all invitations (admin only, paginated).

    - **skip**: Number of invitations to skip (default 0)
    - **limit**: Maximum number of invitations to return (default 10)
    """
    # Get invitations
    result = await db.execute(
        select(Invitation)
        .order_by(Invitation.created_at.desc())
        .limit(limit)
        .offset(skip)
    )
    invitations = result.scalars().all()

    return invitations


@router.get("/validate/{token}", response_model=InvitationValidation)
async def validate_invitation(token: str, db: AsyncSession = Depends(get_db)):
    """
    Validate an invitation token (public endpoint).

    - Used by registration page to check if token is valid
    - Returns validation status and associated email
    """
    # Find invitation
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    invitation = result.scalar_one_or_none()

    if not invitation:
        return InvitationValidation(valid=False, message="Invitation not found")

    if invitation.used:
        return InvitationValidation(
            valid=False,
            email=invitation.email,
            message="Invitation has already been used",
        )

    if invitation.is_expired:
        return InvitationValidation(
            valid=False, email=invitation.email, message="Invitation has expired"
        )

    return InvitationValidation(
        valid=True, email=invitation.email, message="Invitation is valid"
    )


@router.delete("/{invitation_id}", status_code=status.HTTP_200_OK)
async def delete_invitation(
    invitation_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke (delete) an invitation (admin only).
    """
    # Get invitation
    result = await db.execute(select(Invitation).where(Invitation.id == invitation_id))
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        )

    # Delete invitation
    await db.delete(invitation)
    await db.commit()

    return {"message": "Invitation revoked successfully"}
