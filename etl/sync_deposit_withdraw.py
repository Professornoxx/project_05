"""Entry point: syncs deposit and withdraw, 5 calendar days including today."""
import os
import sys

import common
import sync_engine

SYNC_WINDOW_DAYS = int(os.environ.get("SYNC_WINDOW_DAYS", "5"))


def main():
    begin_time, end_time = common.deposit_withdraw_window(SYNC_WINDOW_DAYS)
    failures = []
    for source in ("deposit", "withdraw"):
        try:
            sync_engine.sync_source(source, begin_time, end_time)
        except Exception as e:
            failures.append(f"{source}: {e}")
    if failures:
        print("Failures:\n" + "\n".join(failures), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
