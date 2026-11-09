"""default-on run profiling helpers, scoped to a run rather than to an import."""

from __future__ import annotations

import logging
import resource
import sys
import time
import tracemalloc
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)


def _rss_mb(usage: resource.struct_rusage) -> float:
    """ru_maxrss as mebibytes (linux kilobytes, darwin bytes)."""
    raw = usage.ru_maxrss
    if sys.platform == "darwin":
        return raw / (1024 * 1024)
    return raw / 1024


@contextmanager
def run_resources(*, enabled: bool = True, python_peak: bool = False) -> Iterator[None]:
    """log wall/cpu interval and peak RSS for the wrapped block.

    no-op when ``enabled`` is false. stdlib only. nest with ``profiled`` for a
    call-tree HTML. peak RSS is the kernel's process-lifetime max (``ru_maxrss``)
    at exit of the block - still the right signal for "did this run blow RAM".
    """
    if not enabled:
        yield
        return

    if python_peak:
        tracemalloc.start()
    wall0 = time.perf_counter()
    self0 = resource.getrusage(resource.RUSAGE_SELF)
    child0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    try:
        yield
    finally:
        wall_s = time.perf_counter() - wall0
        self1 = resource.getrusage(resource.RUSAGE_SELF)
        child1 = resource.getrusage(resource.RUSAGE_CHILDREN)
        user_s = (self1.ru_utime - self0.ru_utime) + (child1.ru_utime - child0.ru_utime)
        sys_s = (self1.ru_stime - self0.ru_stime) + (child1.ru_stime - child0.ru_stime)
        cpu_s = user_s + sys_s
        msg = (
            "run resources: wall=%.2fs cpu=%.2fs (user=%.2fs sys=%.2fs) "
            "peak_rss_self=%.1fMiB peak_rss_children=%.1fMiB"
            % (wall_s, cpu_s, user_s, sys_s, _rss_mb(self1), _rss_mb(child1))
        )
        if python_peak:
            _current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            msg += " peak_python=%.1fMiB" % (peak / (1024 * 1024))
        logger.info(msg)


@contextmanager
def profiled(out: Path | None) -> Iterator[None]:
    """profile the wrapped block and write an html report to out; no-op when out is None."""
    if out is None:
        yield
        return

    # imported lazily so an experiment that never profiles carries no pyinstrument dependency
    from pyinstrument import Profiler

    profiler = Profiler()
    profiler.start()
    try:
        yield
    finally:
        profiler.stop()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(profiler.output_html())
        logger.info("wrote profile to %s", out)


def profile_html_path(experiment_dir: Path, name: str = "run.html") -> Path:
    """return the experiment-owned html report path under .results/profile/."""
    return Path(experiment_dir) / ".results" / "profile" / name
