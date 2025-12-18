"""
Category management API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
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
        category_dict = {
            "id": category.id,
            "name": category.name,
            "slug": category.slug,
            "created_by": category.created_by,
            "created_at": category.created_at,
            "video_count": video_count,
        }
        categories.append(CategoryResponse(**category_dict))

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
        created_by=admin.id,
    )

    db.add(category)
    await db.commit()
    await db.refresh(category)

    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        created_by=category.created_by,
        created_at=category.created_at,
        video_count=0,
    )


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: uuid.UUID,
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

    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        created_by=category.created_by,
        created_at=category.created_at,
        video_count=video_count,
    )


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Update a category's name (slug is regenerated).
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
    if category_data.name != category.name:
        existing = await db.execute(
            select(Category).where(
                Category.name == category_data.name,
                Category.id != category_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category with name '{category_data.name}' already exists",
            )

    # Update name and regenerate slug (will be unique since name is unique)
    category.name = category_data.name
    category.slug = generate_slug(category_data.name)

    await db.commit()
    await db.refresh(category)

    # Get video count
    video_count_result = await db.execute(
        select(func.count(Video.id)).where(Video.category_id == str(category_id))
    )
    video_count = video_count_result.scalar()

    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        created_by=category.created_by,
        created_at=category.created_at,
        video_count=video_count,
    )


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

    # Delete category (videos' category_id will be set to NULL due to ON DELETE SET NULL)
    await db.delete(category)
    await db.commit()

    return None
