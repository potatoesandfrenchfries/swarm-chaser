"""python -m ledger [refresh | verify | score | bundle | all]  [--root PATH]"""
import argparse
import sys

from .bundle import bundle
from .paths import Paths
from .refresh import refresh
from .score import score
from .verify import verify


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ledger", description=__doc__)
    parser.add_argument("step", choices=["refresh", "verify", "score", "bundle", "all"])
    parser.add_argument("--root", default=None, help="project folder (default: this template)")
    args = parser.parse_args(argv)
    paths = Paths(args.root) if args.root else Paths()

    if args.step in ("refresh", "all"):
        print("\n".join(refresh(paths)))
    if args.step in ("verify", "all"):
        kept, dropped = verify(paths)
        print(f"verify: kept {len(kept)}, dropped {len(dropped)}")
        for d in dropped:
            print(f"  DROPPED {d['owner']} | {d['text'][:60]} | {d['why'][:80]}")
    if args.step in ("score", "all"):
        for r in score(paths):
            print(f"score:  {r['score']:.2f} {r['confidence']:<6} {r['verdict']:<20} {r['claim_id']}")
    if args.step in ("bundle", "all"):
        data = bundle(paths)
        print(f"bundle: {len(data['claims'])} claims, {len(data['changes'])} changes -> {paths.site_data.relative_to(paths.root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
