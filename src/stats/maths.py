"""The few distribution functions the statistics need, in the standard library.

src/ imports nothing third-party (tests/test_pipeline_contract.py), so numpy and scipy are not available here.
Each function is checked against known values in tests/test_stats.py.
"""
from math import comb, exp, lgamma, log
from statistics import NormalDist

_NORMAL = NormalDist()


def norm_sf(z: float) -> float:
    """P(Z > z) for a standard normal."""
    return 1 - _NORMAL.cdf(z)


def norm_ppf(p: float) -> float:
    """The z with P(Z <= z) = p."""
    return _NORMAL.inv_cdf(p)


def chi2_sf(x: float, df: int) -> float:
    """P(chi-squared with `df` degrees of freedom > x): the regularised upper incomplete gamma Q(df/2, x/2), by its
    series below the mean and a continued fraction above it."""
    if x <= 0:
        return 1.0
    a, y = df / 2, x / 2
    if y < a + 1:
        term = total = 1 / a
        n = a
        while abs(term) > abs(total) * 1e-15:
            n += 1
            term *= y / n
            total += term
        return max(0.0, 1 - total * exp(-y + a * log(y) - lgamma(a)))
    tiny = 1e-300
    b = y + 1 - a
    c, d = 1 / tiny, 1 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return min(1.0, exp(-y + a * log(y) - lgamma(a)) * h)


def fisher_two_sided(k1: int, n1: int, k2: int, n2: int) -> float:
    """Fisher's exact two-sided p for k1 of n1 against k2 of n2: the total probability of every table with the same
    margins that is no likelier than the one seen."""
    k, n = k1 + k2, n1 + n2
    denom = comb(n, k)

    def pmf(x: int) -> float:
        return comb(n1, x) * comb(n2, k - x) / denom

    seen = pmf(k1)
    return min(1.0, sum(p for x in range(max(0, k - n2), min(n1, k) + 1) if (p := pmf(x)) <= seen * (1 + 1e-7)))


def binom_two_sided_half(k: int, n: int) -> float:
    """Exact two-sided p for k successes in n trials against a probability of one half."""
    if n == 0:
        return 1.0
    return min(1.0, 2 * sum(comb(n, i) for i in range(min(k, n - k) + 1)) / 2**n)


def solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Solve a x = b by Gaussian elimination with partial pivoting. Raises ValueError if `a` is singular."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[pivot][col]) < 1e-12:
            raise ValueError("singular matrix")
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(col + 1, n):
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (m[i][n] - sum(m[i][j] * x[j] for j in range(i + 1, n))) / m[i][i]
    return x


def xlogy(x: float, y: float) -> float:
    """x * log(y), taken as 0 when x is 0."""
    return x * log(y) if x else 0.0

