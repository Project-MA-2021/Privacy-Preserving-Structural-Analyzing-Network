from __future__ import annotations

from typing import Any, Dict

from phe import paillier


def serialize_public_key(public_key: paillier.PaillierPublicKey) -> Dict[str, str]:
    return {"n": str(public_key.n)}


def build_public_key(payload: Dict[str, Any]) -> paillier.PaillierPublicKey:
    n_raw = payload.get("n")
    if n_raw is None:
        raise ValueError("public key is missing field 'n'")
    return paillier.PaillierPublicKey(n=int(n_raw))


def serialize_encrypted_number(value: paillier.EncryptedNumber) -> Dict[str, str | int]:
    return {
        "ciphertext": str(value.ciphertext()),
        "exponent": int(value.exponent),
    }


def deserialize_encrypted_number(
    public_key: paillier.PaillierPublicKey, payload: Dict[str, Any]
) -> paillier.EncryptedNumber:
    ciphertext_raw = payload.get("ciphertext")
    exponent_raw = payload.get("exponent")
    if ciphertext_raw is None or exponent_raw is None:
        raise ValueError("cipher payload must include 'ciphertext' and 'exponent'")
    return paillier.EncryptedNumber(
        public_key=public_key,
        ciphertext=int(ciphertext_raw),
        exponent=int(exponent_raw),
    )

