from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path


class TicketLock:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._next_ticket = 0
        self._serving = 0

    @contextmanager
    def acquire(self):
        with self._condition:
            ticket = self._next_ticket
            self._next_ticket += 1
            while ticket != self._serving:
                self._condition.wait()
        try:
            yield
        finally:
            with self._condition:
                self._serving += 1
                self._condition.notify_all()


_ticket_lock = TicketLock()


@contextmanager
def _file_lock(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write("0")
            handle.flush()
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def data_lock(data_dir: Path):
    lock_path = data_dir / ".data.lock"
    with _ticket_lock.acquire():
        with _file_lock(lock_path):
            yield
