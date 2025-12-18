"""
Image processing service for category images.

Handles resizing and converting images to WebP format for optimal file size.
"""

import logging
from pathlib import Path
from PIL import Image
from typing import Tuple

logger = logging.getLogger(__name__)


def resize_and_convert_image(
    input_path: Path,
    output_path: Path,
    size: Tuple[int, int] = (400, 400),
    quality: int = 85,
) -> int:
    """
    Resize and convert image to WebP format.

    Args:
        input_path: Path to source image file
        output_path: Path where processed image will be saved
        size: Target dimensions (width, height). Image will be resized to fit within this,
              maintaining aspect ratio, then centered on a square canvas
        quality: WebP quality (0-100, default 85)

    Returns:
        File size in bytes of the processed image

    Raises:
        ValueError: If image cannot be opened or processed
    """
    try:
        # Open and process image
        with Image.open(input_path) as img:
            # Convert RGBA to RGB if necessary (WebP supports RGBA but we'll use RGB for simplicity)
            if img.mode in ("RGBA", "LA", "P"):
                # Create white background
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(
                    img, mask=img.split()[-1] if img.mode == "RGBA" else None
                )
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Calculate resize dimensions to fit within target size while maintaining aspect ratio
            img.thumbnail(size, Image.Resampling.LANCZOS)

            # Create square canvas with white background
            canvas = Image.new("RGB", size, (255, 255, 255))

            # Center the image on the canvas
            offset = ((size[0] - img.width) // 2, (size[1] - img.height) // 2)
            canvas.paste(img, offset)

            # Save as WebP
            canvas.save(output_path, "WEBP", quality=quality, method=6)

            # Get file size
            file_size = output_path.stat().st_size

            logger.info(
                f"Processed image: {input_path.name} -> {output_path.name} "
                f"({file_size / 1024:.1f} KB)"
            )

            return file_size

    except Exception as e:
        logger.error(f"Error processing image {input_path}: {e}")
        raise ValueError(f"Failed to process image: {str(e)}")


def validate_image_file(file_path: Path, max_size_bytes: int = 5_242_880) -> None:
    """
    Validate that a file is a valid image and within size limits.

    Args:
        file_path: Path to image file to validate
        max_size_bytes: Maximum allowed file size (default 5MB)

    Raises:
        ValueError: If file is invalid or too large
    """
    # Check file size
    file_size = file_path.stat().st_size
    if file_size > max_size_bytes:
        raise ValueError(
            f"Image file too large: {file_size / 1024 / 1024:.1f} MB "
            f"(max: {max_size_bytes / 1024 / 1024:.1f} MB)"
        )

    # Try to open as image
    try:
        with Image.open(file_path) as img:
            # Verify it's a valid image
            img.verify()

        # Re-open to check format (verify() closes the file)
        with Image.open(file_path) as img:
            # Check if format is supported
            if img.format not in ["JPEG", "PNG", "GIF", "WEBP", "BMP"]:
                raise ValueError(f"Unsupported image format: {img.format}")

    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Invalid image file: {str(e)}")
