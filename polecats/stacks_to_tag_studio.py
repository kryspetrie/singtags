#!/usr/bin/env python3
"""Retired: do not publish auto pitch_studio.json into Tag Studio seeds.

Tag page “Import into Tag Studio” and polecat pitch seeds were removed until
projects can be validated by hand. See
``web/public/tag-studio/polecat-pitch-reviews/README.md``.
"""

from __future__ import annotations

import sys


def main() -> int:
    print(
        "stacks_to_tag_studio.py is retired — pitch_studio auto-seeds are not published.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
