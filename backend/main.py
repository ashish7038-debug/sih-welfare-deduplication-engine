from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import Base, ScanRecord, SessionLocal, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SIH Welfare Deduplication Backend", version="1.0.0")


class ScanCreateRequest(BaseModel):
    device_id: str = Field(..., min_length=1)
    raw_input: str = Field(..., min_length=1)
    severity: str = Field(default="low")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: str = Field(default="camera")


class ScanRecordResponse(BaseModel):
    id: int
    device_id: str
    raw_input: str
    severity: str
    confidence: float
    source: str
    created_at: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "sih-welfare-backend"}


@app.post("/api/scans", response_model=ScanRecordResponse)
def create_scan(scan: ScanCreateRequest, db: Session = Depends(get_db)):
    record = ScanRecord(
        device_id=scan.device_id,
        raw_input=scan.raw_input,
        severity=scan.severity,
        confidence=scan.confidence,
        source=scan.source,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "device_id": record.device_id,
        "raw_input": record.raw_input,
        "severity": record.severity,
        "confidence": record.confidence,
        "source": record.source,
        "created_at": record.created_at.isoformat() if record.created_at else "",
    }


@app.get("/api/scans", response_model=list[ScanRecordResponse])
def list_scans(db: Session = Depends(get_db)):
    records = db.query(ScanRecord).order_by(ScanRecord.created_at.desc()).all()
    return [
        {
            "id": record.id,
            "device_id": record.device_id,
            "raw_input": record.raw_input,
            "severity": record.severity,
            "confidence": record.confidence,
            "source": record.source,
            "created_at": record.created_at.isoformat() if record.created_at else "",
        }
        for record in records
    ]


@app.get("/api/analytics")
def analytics(db: Session = Depends(get_db)):
    total_scans = db.query(ScanRecord).count()
    severity_rows = (
        db.query(ScanRecord.severity, func.count(ScanRecord.id))
        .group_by(ScanRecord.severity)
        .all()
    )
    average_confidence = db.query(func.avg(ScanRecord.confidence)).scalar() or 0.0

    return {
        "total_scans": total_scans,
        "severity_breakdown": {severity: count for severity, count in severity_rows},
        "average_confidence": round(float(average_confidence), 4),
        "recent_records": [
            {
                "id": record.id,
                "device_id": record.device_id,
                "severity": record.severity,
                "confidence": record.confidence,
            }
            for record in db.query(ScanRecord)
            .order_by(ScanRecord.created_at.desc())
            .limit(5)
            .all()
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
