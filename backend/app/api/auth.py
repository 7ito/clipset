from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_active_user
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest
from app.schemas.user import UserWithQuota
from app.services import auth as auth_service
from app.utils.security import create_access_token
from app.models.user import User

router = APIRouter()


@router.post("/register", response_model=UserWithQuota, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user with an invitation token.
    
    - **email**: User email address
    - **username**: Unique username (alphanumeric + underscore)
    - **password**: Password (minimum 8 characters)
    - **invitation_token**: Valid invitation token
    """
    # Validate invitation token
    invitation = await auth_service.validate_invitation(db, request.invitation_token)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token"
        )
    
    # Check if invitation email matches provided email
    if invitation.email != request.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email does not match invitation"
        )
    
    # Check if user already exists
    if await auth_service.check_user_exists(db, email=request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if await auth_service.check_user_exists(db, username=request.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create user
    user = await auth_service.create_user(
        db=db,
        email=request.email,
        username=request.username,
        password=request.password
    )
    
    # Mark invitation as used
    await auth_service.mark_invitation_used(db, invitation)
    
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with username and password to receive a JWT token.
    
    - **username**: Username (case-insensitive)
    - **password**: Password
    """
    # Authenticate user
    user = await auth_service.authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    # Create access token
    access_token = create_access_token(
        data={"user_id": user.id, "username": user.username, "role": user.role}
    )
    
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserWithQuota)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current authenticated user's information including quota.
    """
    return current_user
