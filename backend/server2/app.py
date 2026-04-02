from __future__ import annotations

from typing import Any, Dict

from flask import Flask, request
from flask_cors import CORS
from phe import paillier

from shared_contract.crypto import (
    deserialize_encrypted_number,
    serialize_public_key,
)
from shared_contract.http import err, ok

app = Flask(__name__)
CORS(app)

_PUBLIC_KEY: paillier.PaillierPublicKey | None = None
_PRIVATE_KEY: paillier.PaillierPrivateKey | None = None


def _get_body() -> Dict[str, Any]:
    return request.get_json(silent=True) or {}


@app.get("/api/v1/crypto/health")
def health():
    return ok(
        {
            "service": "server2",
            "key_loaded": _PUBLIC_KEY is not None and _PRIVATE_KEY is not None,
        }
    )


@app.post("/api/v1/crypto/keygen")
def keygen():
    global _PUBLIC_KEY, _PRIVATE_KEY

    body = _get_body()
    n_length = int(body.get("n_length", 512))
    if n_length < 256:
        return err("INVALID_N_LENGTH", "n_length must be >= 256")

    _PUBLIC_KEY, _PRIVATE_KEY = paillier.generate_paillier_keypair(n_length=n_length)

    return ok(
        {
            "public_key": serialize_public_key(_PUBLIC_KEY),
            "n_length": n_length,
        }
    )


@app.post("/api/v1/crypto/decrypt-score")
def decrypt_score():
    if _PUBLIC_KEY is None or _PRIVATE_KEY is None:
        return err("KEY_NOT_READY", "please call /api/v1/crypto/keygen first", 409)

    body = _get_body()
    cipher_payload = body.get("cipher")
    if not isinstance(cipher_payload, dict):
        return err("INVALID_PAYLOAD", "field 'cipher' must be an object")

    try:
        encrypted = deserialize_encrypted_number(_PUBLIC_KEY, cipher_payload)
        score = _PRIVATE_KEY.decrypt(encrypted)
    except Exception as ex:
        return err("DECRYPT_FAILED", f"failed to decrypt score: {ex}")

    return ok({"score": float(score)})


@app.post("/api/v1/crypto/compare")
def compare():
    body = _get_body()
    prev_score = body.get("prev_score")
    new_score = body.get("new_score")
    if new_score is None:
        return err("INVALID_PAYLOAD", "field 'new_score' is required")

    try:
        new_score_num = float(new_score)
        prev_score_num = float(prev_score) if prev_score is not None else None
    except ValueError:
        return err("INVALID_PAYLOAD", "scores must be numeric")

    c_t = 1 if prev_score_num is None or new_score_num < prev_score_num else 0
    return ok({"c_t": c_t})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False, use_reloader=False)
