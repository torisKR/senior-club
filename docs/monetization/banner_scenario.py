#!/usr/bin/env python3
"""Hypothetical banner scenarios only; no file access, AWS calls, or network."""

import argparse
import json
from decimal import Decimal, ROUND_CEILING


def positive(value):
    try:
        number = Decimal(value)
    except ArithmeticError as error:
        raise argparse.ArgumentTypeError("Expected a finite positive number") from error
    if not number.is_finite() or number <= 0:
        raise argparse.ArgumentTypeError("Expected a finite positive number")
    return number


def ceil(number):
    return int(number.to_integral_value(rounding=ROUND_CEILING))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cost", type=positive, default=Decimal("80"),
                        help="Hypothetical cost in USD; not an actual app cost")
    parser.add_argument("--ecpm", type=positive, nargs="+",
                        default=[Decimal("1"), Decimal("2"), Decimal("5")],
                        help="Hypothetical USD eCPMs; not observed ad rates")
    parser.add_argument("--days", type=positive, default=Decimal("31"))
    parser.add_argument("--views-per-dau", type=positive, default=Decimal("5"),
                        help="Hypothetical served impressions per ad-eligible user per day")
    args = parser.parse_args()
    rows = []
    for ecpm in args.ecpm:
        impressions = args.cost / ecpm * 1000
        rows.append({"hypothetical_ecpm_usd": str(ecpm),
                     "break_even_served_impressions": ceil(impressions),
                     "daily_served_impressions_rounded_up": ceil(impressions / args.days),
                     "hypothetical_ad_eligible_dau": ceil(impressions / args.days / args.views_per_dau)})
    print(json.dumps({"all_inputs_are_hypothetical": True,
                      "hypothetical_cost_usd": str(args.cost),
                      "hypothetical_days": str(args.days),
                      "hypothetical_served_views_per_dau_per_day": str(args.views_per_dau),
                      "revenue_guaranteed": False, "scenarios": rows}, indent=2))


if __name__ == "__main__":
    main()
