"""
Chunk manager service for handling large file uploads in parts.
"""

import os
import shutil
import logging
from pathlib import Path
from typing import List, Optional
import uuid

from app.config import settings

logger = logging.getLogger(__name__)

def get_upload_session_path(upload_id: str) -> Path:
    """Get the path for a specific upload session's chunks."""
    return Path(settings.CHUNKS_STORAGE_PATH) / upload_id

def init_upload_session() -> str:
    """Initialize a new upload session and return a unique ID."""
    upload_id = str(uuid.uuid4())
    session_path = get_upload_session_path(upload_id)
    session_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Initialized chunked upload session: {upload_id}")
    return upload_id

def save_chunk(upload_id: str, chunk_index: int, chunk_data: bytes) -> int:
    """Save a single chunk to disk."""
    session_path = get_upload_session_path(upload_id)
    if not session_path.exists():
        raise ValueError(f"Upload session not found: {upload_id}")
    
    chunk_path = session_path / f"chunk_{chunk_index:05d}"
    with open(chunk_path, "wb") as f:
        f.write(chunk_data)
    
    logger.debug(f"Saved chunk {chunk_index} for upload {upload_id}")
    return len(chunk_data)

def merge_chunks(upload_id: str, destination_path: Path) -> int:
    """Merge all chunks in a session into a single file."""
    session_path = get_upload_session_path(upload_id)
    if not session_path.exists():
        raise ValueError(f"Upload session not found: {upload_id}")
    
    # Get all chunks and sort them
    chunks = sorted(session_path.glob("chunk_*"))
    if not chunks:
        raise ValueError(f"No chunks found for upload: {upload_id}")
    
    total_bytes = 0
    try:
        with open(destination_path, "wb") as dest:
            for chunk_path in chunks:
                with open(chunk_path, "rb") as src:
                    shutil.copyfileobj(src, dest)
                    total_bytes += chunk_path.stat().st_size
        
        logger.info(f"Merged {len(chunks)} chunks for upload {upload_id} into {destination_path} ({total_bytes} bytes)")
        return total_bytes
    except Exception as e:
        logger.error(f"Failed to merge chunks for upload {upload_id}: {e}")
        if destination_path.exists():
            destination_path.unlink()
        raise

def cleanup_session(upload_id: str) -> None:
    """Delete a chunked upload session and all its chunks."""
    session_path = get_upload_session_path(upload_id)
    if session_path.exists():
        shutil.rmtree(session_path)
        logger.info(f"Cleaned up chunked upload session: {upload_id}")
