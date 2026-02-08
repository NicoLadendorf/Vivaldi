from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from config import Config, ensure_dirs
from db import make_engine, make_session_factory, Base
from migrations import ensure_fingering_sets_schema
from models import FingeringSet
from schemas import coerce_events
from omr.omr_service import transcribe_score
from fingering.engine import compute_fingering

load_dotenv()

def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    cfg = Config()
    ensure_dirs(cfg)
    app.config["MAX_CONTENT_LENGTH"] = cfg.MAX_CONTENT_LENGTH_BYTES

    engine = make_engine(cfg.DATABASE_URL)
    SessionLocal = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)
    # If the user already has an older SQLite DB, add newly required columns.
    ensure_fingering_sets_schema(engine)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/transcribe")
    def api_transcribe():
        if "file" not in request.files:
            return jsonify({"error": "missing multipart file field 'file'"}), 400
        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "empty filename"}), 400

        suffix = Path(f.filename).suffix.lower()
        save_id = str(uuid.uuid4())
        upload_path = cfg.UPLOAD_DIR / f"{save_id}{suffix}"
        f.save(upload_path)

        try:
            events, meta = transcribe_score(upload_path, cfg)
        except Exception as e:
            return jsonify({"error": str(e)}), 400

        # Return in your original tuple form as well as object form.
        # Notes may include a 4th field: slur_to_next (bool).
        tuple_events = [
            [ev.type, ev.beats, ev.note, bool(getattr(ev, "slur_to_next", False))] if ev.type == "N"
            else [ev.type, ev.beats]
            for ev in events
        ]
        obj_events = [
            {"type": ev.type, "beats": ev.beats, "note": ev.note, "slur_to_next": bool(getattr(ev, "slur_to_next", False))}
            if ev.type == "N"
            else {"type": ev.type, "beats": ev.beats, "note": None}
            for ev in events
        ]

        return jsonify({
            "events_tuples": tuple_events,
            "events": obj_events,
            "meta": meta,
        })

    @app.post("/api/finger")
    def api_finger():
        payload = request.get_json(force=True, silent=False)
        events = coerce_events(payload.get("events"))
        bpm = float(payload.get("bpm", 80.0))
        fingering, total_cost = compute_fingering(events, bpm=bpm)
        return jsonify({"fingering": fingering, "total_cost": total_cost})

    @app.get("/api/saves")
    def api_list_saves():
        with SessionLocal() as db:
            rows = db.query(FingeringSet).order_by(FingeringSet.created_at.desc()).all()
            return jsonify([{
                "id": r.id,
                "title": r.title,
                "created_at": r.created_at.isoformat(),
                "updated_at": r.updated_at.isoformat() if getattr(r, "updated_at", None) else r.created_at.isoformat(),
                "last_reviewed": r.last_reviewed.isoformat() if getattr(r, "last_reviewed", None) else None,
                "review_count": int(getattr(r, "review_count", 0) or 0),
                "score_filename": r.score_filename,
                "num_events": len(json.loads(r.events_json)),
            } for r in rows])

    @app.post("/api/saves")
    def api_create_save():
        payload = request.get_json(force=True, silent=False)
        title = (payload.get("title") or "Untitled").strip()
        events = payload.get("events")
        fingering = payload.get("fingering")
        score_filename = payload.get("score_filename")

        if not isinstance(events, list) or not isinstance(fingering, list):
            return jsonify({"error": "events and fingering must be lists"}), 400

        new_id = str(uuid.uuid4())
        with SessionLocal() as db:
            now = FingeringSet.now()
            row = FingeringSet(
                id=new_id,
                title=title[:200],
                created_at=now,
                updated_at=now,
                last_reviewed=None,
                review_count=0,
                score_filename=score_filename,
                events_json=json.dumps(events),
                fingering_json=json.dumps(fingering),
            )
            db.add(row)
            db.commit()

        return jsonify({"id": new_id})

    @app.get("/api/saves/<sid>")
    def api_get_save(sid: str):
        with SessionLocal() as db:
            row = db.get(FingeringSet, sid)
            if not row:
                return jsonify({"error": "not found"}), 404
            return jsonify({
                "id": row.id,
                "title": row.title,
                "created_at": row.created_at.isoformat(),
                "updated_at": row.updated_at.isoformat() if getattr(row, "updated_at", None) else row.created_at.isoformat(),
                "last_reviewed": row.last_reviewed.isoformat() if getattr(row, "last_reviewed", None) else None,
                "review_count": int(getattr(row, "review_count", 0) or 0),
                "score_filename": row.score_filename,
                "events": json.loads(row.events_json),
                "fingering": json.loads(row.fingering_json),
            })

    @app.put("/api/saves/<sid>")
    def api_update_save(sid: str):
        payload = request.get_json(force=True, silent=False)
        with SessionLocal() as db:
            row = db.get(FingeringSet, sid)
            if not row:
                return jsonify({"error": "not found"}), 404

            if "title" in payload:
                title = (payload.get("title") or "Untitled").strip()
                row.title = title[:200]

            if "score_filename" in payload:
                row.score_filename = payload.get("score_filename")

            if "events" in payload:
                events = payload.get("events")
                if not isinstance(events, list):
                    return jsonify({"error": "events must be a list"}), 400
                row.events_json = json.dumps(events)

            if "fingering" in payload:
                fingering = payload.get("fingering")
                if not isinstance(fingering, list):
                    return jsonify({"error": "fingering must be a list"}), 400
                row.fingering_json = json.dumps(fingering)

            row.updated_at = FingeringSet.now()
            db.add(row)
            db.commit()

            return jsonify({"ok": True})

    @app.post("/api/saves/<sid>/review")
    def api_mark_reviewed(sid: str):
        """Mark a fingering set as reviewed (for the practice queue)."""
        with SessionLocal() as db:
            row = db.get(FingeringSet, sid)
            if not row:
                return jsonify({"error": "not found"}), 404
            row.last_reviewed = FingeringSet.now()
            row.review_count = int(getattr(row, "review_count", 0) or 0) + 1
            row.updated_at = FingeringSet.now()
            db.add(row)
            db.commit()
            return jsonify({
                "ok": True,
                "last_reviewed": row.last_reviewed.isoformat(),
                "review_count": row.review_count,
            })

    @app.delete("/api/saves/<sid>")
    def api_delete_save(sid: str):
        with SessionLocal() as db:
            row = db.get(FingeringSet, sid)
            if not row:
                return jsonify({"error": "not found"}), 404
            db.delete(row)
            db.commit()
        return jsonify({"ok": True})

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
