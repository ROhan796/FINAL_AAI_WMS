# Argon2id Password Hashing Utility

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Initialize PasswordHasher with robust RFC-recommended parameters:
# time_cost = 3 iterations, memory_cost = 64 MB (65536 KB), parallelism = 4 threads
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)

def hash_password(plaintext: str) -> str:
    """
    Hashes a plaintext password using Argon2id with automatic salt generation.
    """
    return ph.hash(plaintext)

def verify_password(stored_hash: str, plaintext: str) -> bool:
    """
    Verifies a plaintext password against a stored Argon2id hash.
    Returns True if valid, False otherwise.
    """
    try:
        return ph.verify(stored_hash, plaintext)
    except VerifyMismatchError:
        return False
