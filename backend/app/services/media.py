"""Helpers for removing uploaded files from the media folder."""
import logging

from ..config import get_settings

log = logging.getLogger("dermavision.media")
settings = get_settings()


def remove_media(*relative_paths: str | None) -> None:
    """Delete files under MEDIA_DIR. Paths that escape the folder, or that do not exist, are ignored."""
    root = settings.media_dir.resolve()
    for rel in relative_paths:
        if not rel:
            continue
        path = (settings.media_dir / rel).resolve()
        if root not in path.parents or not path.is_file():
            continue
        try:
            path.unlink()
        except OSError as exc:  # the database row is already gone, so just log it
            log.warning("Could not delete %s: %s", path, exc)