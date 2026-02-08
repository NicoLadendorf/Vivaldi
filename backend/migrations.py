from __future__ import annotations

"""Lightweight DB migrations for SQLite.

This project avoids Alembic to keep the starter small. Instead we ensure that
newly-added columns exist and backfill defaults when possible.
"""

from sqlalchemy import inspect, text


def ensure_fingering_sets_schema(engine) -> None:
    """Ensure the fingering_sets table contains columns introduced after v0.1."""

    insp = inspect(engine)
    if "fingering_sets" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("fingering_sets")}
    ddl: list[str] = []

    # Added in routing/editing/practice update
    if "updated_at" not in cols:
        ddl.append("ALTER TABLE fingering_sets ADD COLUMN updated_at DATETIME")
    if "last_reviewed" not in cols:
        ddl.append("ALTER TABLE fingering_sets ADD COLUMN last_reviewed DATETIME")
    if "review_count" not in cols:
        ddl.append("ALTER TABLE fingering_sets ADD COLUMN review_count INTEGER DEFAULT 0 NOT NULL")

    if not ddl:
        return

    with engine.begin() as conn:
        for stmt in ddl:
            conn.execute(text(stmt))

        # Backfill for older rows
        # If updated_at was added, set it to created_at for existing rows.
        if "updated_at" not in cols:
            conn.execute(text("UPDATE fingering_sets SET updated_at = created_at WHERE updated_at IS NULL"))
        if "review_count" not in cols:
            conn.execute(text("UPDATE fingering_sets SET review_count = 0 WHERE review_count IS NULL"))
