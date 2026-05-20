"""In-memory similarity store for merchant -> category lookups.

We use sentence-transformers for embeddings and numpy for cosine similarity.
ChromaDB is overkill for ~50 seed entries and requires C++ build tools on Windows.
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
import structlog

log = structlog.get_logger()

_SEED_FILE = Path(__file__).parent.parent / "data" / "category_seeds.json"
_MODEL_NAME = "all-MiniLM-L6-v2"


class CategoryStore:
    def __init__(self):
        self.model = SentenceTransformer(_MODEL_NAME)
        seeds = json.loads(_SEED_FILE.read_text())
        self.merchants: list[str] = [s["merchant"] for s in seeds]
        self.categories: list[str] = [s["category"] for s in seeds]
        self.embeddings: np.ndarray = self.model.encode(
            self.merchants, convert_to_numpy=True, normalize_embeddings=True
        )
        log.info("category_kb_loaded", count=len(self.merchants))

    def find_similar(self, description: str, k: int = 3) -> list[dict]:
        query = self.model.encode([description], convert_to_numpy=True, normalize_embeddings=True)[0]
        # Cosine similarity on normalised vectors = dot product
        scores = self.embeddings @ query
        top_k_idx = np.argsort(-scores)[:k]
        return [
            {
                "merchant": self.merchants[i],
                "category": self.categories[i],
                "distance": float(1.0 - scores[i]),  # convert similarity to distance
            }
            for i in top_k_idx
        ]
