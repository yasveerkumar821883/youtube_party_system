from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database.connection import Base
from app.models.user import Role


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    role: Mapped[Role] = mapped_column(
        SQLEnum(Role),
        nullable=False,
        default=Role.PARTICIPANT,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )