from __future__ import annotations

from typing import Any, Dict

from flask import jsonify


def ok(data: Any = None):
    payload: Dict[str, Any] = {"ok": True}
    if data is not None:
        payload["data"] = data
    return jsonify(payload)


def err(code: str, message: str, status: int = 400):
    return (
        jsonify(
            {
                "ok": False,
                "error": {
                    "code": code,
                    "message": message,
                },
            }
        ),
        status,
    )

