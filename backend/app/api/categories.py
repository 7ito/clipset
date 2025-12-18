"""
Category management API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import uuid
import re

from app.database import get_db
from app.models.user import User
from app.models.category import Category
from app.models.video import Video
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryListResponse,
)
from app.api.deps import get_current_user, require_admin
from app.services import storage

router = APIRouter()


def generate_slug(name: str) -> str:
    """
    Generate a URL-friendly slug from category name.

    Since category names are unique, the generated slug will also be unique.
    """
    # Convert to lowercase
    slug = name.lower()
    # Replace spaces and special characters with hyphens
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    # Remove leading/trailing hyphens
    slug = slug.strip("-")
    return slug


@router.get("/", response_model=CategoryListResponse)
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all categories with video counts.
    Available to all authenticated users.
    """
    # Query categories with video counts
    query = (
        select(Category, func.count(Video.id).label("video_count"))
        .outerjoin(Video, Category.id == Video.category_id)
        .group_by(Category.id)
        .order_by(Category.name)
    )

    result = await db.execute(query)
    rows = result.all()

    categories = []
    for category, video_count in rows:
        categories.append(build_category_response(category, video_count or 0, request))

    return CategoryListResponse(categories=categories, total=len(categories))


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Create a new category.
    Admin only. Slug is auto-generated from name.
    """
    # Check if category with same name already exists
    existing = await db.execute(
        select(Category).where(Category.name == category_data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category with name '{category_data.name}' already exists",
        )

    # Generate slug from name (will be unique since name is unique)
    slug = generate_slug(category_data.name)

    # Create category
    category = Category(
        name=category_data.name,
        slug=slug,
        description=category_data.description,
        created_by=admin.id,
    )

    db.add(category)
    await db.commit()
    await db.refresh(category)

    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        created_by=category.created_by,
        created_at=category.created_at,
        updated_at=category.updated_at,
        video_count=0,
    )


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a single category by ID with video count.
    """
    # Query category with video count
    query = (
        select(Category, func.count(Video.id).label("video_count"))
        .outerjoin(Video, Category.id == Video.category_id)
        .where(Category.id == str(category_id))
        .group_by(Category.id)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    category, video_count = row

    return build_category_response(category, video_count or 0, request)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    category_data: CategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Update a category's name and/or description (slug is regenerated if name changes).
    Admin only.
    """
    # Get existing category
    result = await db.execute(select(Category).where(Category.id == str(category_id)))
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    # Check if new name conflicts with another category
    if category_data.name and category_data.name != category.name:
        existing = await db.execute(
            select(Category).where(
                Category.name == category_data.name,
                Category.id != str(category_id),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category with name '{category_data.name}' already exists",
            )

        # Update name and regenerate slug
        category.name = category_data.name
        category.slug = generate_slug(category_data.name)

    # Update description if provided
    if category_data.description is not None:
        category.description = category_data.description

    await db.commit()
    await db.refresh(category)

    # Get video count
    video_count_result = await db.execute(
        select(func.count(Video.id)).where(Video.category_id == str(category_id))
    )
    video_count = video_count_result.scalar() or 0

    return build_category_response(category, video_count, request)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Delete a category.
    Admin only. Videos in this category will have category_id set to NULL.
    """
    # Get category
    result = await db.execute(select(Category).where(Category.id == str(category_id)))
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    # Delete category image if it exists
    if category.image_filename:
        storage.delete_category_image(category.image_filename)

    # Delete category (videos' category_id will be set to NULL due to ON DELETE SET NULL)
    await db.delete(category)
    await db.commit()

    return None


# Helper function for building CategoryResponse with image_url
def build_category_response(
    category: Category, video_count: int, request: Request
) -> CategoryResponse:
    """Build CategoryResponse with computed image_url."""
    image_url = None
    if category.image_filename:
        # Build full URL for image endpoint
        image_url = str(request.url_for("get_category_image", category_id=category.id))

    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        image_filename=category.image_filename,
        image_url=image_url,
        created_by=category.created_by,
        created_at=category.created_at,
        updated_at=category.updated_at,
        video_count=video_count,
    )


# Category Image Endpoints


@router.post("/{category_id}/image", response_model=CategoryResponse)
async def upload_category_image(
    category_id: uuid.UUID,
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Upload and attach image to category (admin only).
    Image will be resized to 400x400 square and converted to WebP.
    """
    # Get category
    result = await db.execute(select(Category).where(Category.id == str(category_id)))
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    try:
        # Delete old image if exists
        if category.image_filename:
            storage.delete_category_image(category.image_filename)

        # Save and process new image
        filename, file_size = storage.save_category_image(file, str(category_id))

        # Update category record
        category.image_filename = filename
        await db.commit()
        await db.refresh(category)

        # Get video count
        video_count_result = await db.execute(
            select(func.count(Video.id)).where(Video.category_id == str(category_id))
        )
        video_count = video_count_result.scalar() or 0

        return build_category_response(category, video_count, request)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(e)}",
        )


@router.get("/{category_id}/image")
async def get_category_image(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Serve category image file.
    Public endpoint (no auth required for browsing).
    """
    # Get category
    result = await db.execute(select(Category).where(Category.id == str(category_id)))
    category = result.scalar_one_or_none()

    if not category or not category.image_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category image not found",
        )

    # Get image path
    image_path = storage.get_category_image_path(category.image_filename)

    if not image_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found",
        )

    # Return image file with cache headers
    return FileResponse(
        path=image_path,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000",  # 1 year
        },
    )


@router.delete("/{category_id}/image", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_image(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Remove category image (admin only).
    """
    # Get category
    result = await db.execute(select(Category).where(Category.id == str(category_id)))
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if not category.image_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category has no image",
        )

    # Delete image file
    storage.delete_category_image(category.image_filename)

    # Update category record
    category.image_filename = None
    await db.commit()

    return None


@router.get("/slug/{slug}", response_model=CategoryResponse)
async def get_category_by_slug(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get category by slug (for clean URLs).
    """
    # Query category with video count
    query = (
        select(Category, func.count(Video.id).label("video_count"))
        .outerjoin(Video, Category.id == Video.category_id)
        .where(Category.slug == slug)
        .group_by(Category.id)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    category, video_count = row

    return build_category_response(category, video_count or 0, request)
