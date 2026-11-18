"""OnCueX reference engine.

A small, headless implementation of the contract in docs/. It is deliberately
boring: pure functions over a snapshot, an append-only event log, and two
independent counters.

    engine   typed schema validation, requirement evaluation, integrated checks
    store    event log, counters, command validation, decision currentness
"""

from .engine import (
    SchemaError,
    evaluate,
    integrated_checks,
    validate_snapshot,
    TYPED_PATHS,
)
from .store import Store, CommandError

__all__ = [
    "SchemaError",
    "CommandError",
    "Store",
    "evaluate",
    "integrated_checks",
    "validate_snapshot",
    "TYPED_PATHS",
]
