from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_and_read_scan_record():
    payload = {
        "device_id": "device-123",
        "raw_input": "sample resident data",
        "severity": "medium",
        "confidence": 0.91,
        "source": "camera"
    }

    create_response = client.post("/api/scans", json=payload)
    assert create_response.status_code == 200
    body = create_response.json()
    assert body["device_id"] == payload["device_id"]
    assert body["severity"] == payload["severity"]

    list_response = client.get("/api/scans")
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 1


def test_analytics_endpoint():
    response = client.get("/api/analytics")
    assert response.status_code == 200
    data = response.json()
    assert "total_scans" in data
    assert "severity_breakdown" in data
    assert "average_confidence" in data
