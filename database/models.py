from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine, func
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ScanRecord(Base):
    __tablename__ = "scan_records"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False)
    raw_input = Column(Text, nullable=False)
    severity = Column(String(50), default="low")
    confidence = Column(Float, nullable=False, default=0.0)
    source = Column(String(100), default="camera")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "raw_input": self.raw_input,
            "severity": self.severity,
            "confidence": self.confidence,
            "source": self.source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


Base.metadata.create_all(bind=engine)
