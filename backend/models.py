from __future__ import annotations
from sqlalchemy import String, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from db import Base

class FingeringSet(Base):
    __tablename__ = "fingering_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_reviewed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # JSON blobs (events + fingerings)
    events_json: Mapped[str] = mapped_column(Text, nullable=False)
    fingering_json: Mapped[str] = mapped_column(Text, nullable=False)

    @staticmethod
    def now() -> datetime:
        return datetime.now(timezone.utc)
