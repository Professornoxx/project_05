"""
Entry point: syncs wallet details, exactly one IST calendar day per run.
First run after IST midnight -> previous day. Every later run that IST
day -> current day. No row-count ceiling here (unlike the Workers version) —
Python/GitHub Actions has no per-invocation CPU-time or subrequest limit, so
even the full ~100,000-row daily volume is fine; it just takes longer
wall-clock time, which a background job can afford.
"""
import common
import sync_engine


def main():
    is_first = common.is_first_wallet_run_of_day()
    begin_time, end_time = common.wallet_window(is_first)
    print(f"is_first_wallet_run_of_day={is_first}")
    sync_engine.sync_source("wallet", begin_time, end_time)


if __name__ == "__main__":
    main()
