"""Emit only numeric counts from a bounded actual Node TAP report on stdin."""
import json
import re
import sys


def summary(raw):
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("Test report exceeds bounds")
    counts = {}
    for key in ("tests", "pass", "fail", "cancelled", "skipped"):
        values = re.findall(r"^# " + key + r" ([0-9]{1,6})$", raw, flags=re.MULTILINE)
        if len(values) != 1:
            raise ValueError("Missing or ambiguous actual TAP summary")
        counts[key] = int(values[0])
    if counts["tests"] < 1 or counts["pass"] != counts["tests"] or any(counts[key] for key in ("fail", "cancelled", "skipped")):
        raise ValueError("Brain tests are incomplete or failed")
    return counts


if __name__ == "__main__":
    report = summary(sys.stdin.read(2 * 1024 * 1024 + 1))
    print("::notice title=Brain runtime tests::" + json.dumps(report, sort_keys=True))
