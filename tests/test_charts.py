import math
import xml.etree.ElementTree as ET

from eval.forecaster import Prediction, calibration_bins
from report.charts import calibration_svg, grid_svg, headline_svg
from report.headline import by_model_month, headline


def rec(verdict, model="m", ts="2025-06-01T00:00:00Z", extractor="e1", judge="j1"):
    return {"claim_id": f"{model}{ts}{verdict}{extractor}{judge}", "model": model, "ts": ts, "verdict": verdict, "extractor": extractor, "judge": judge}


def parse(svg):
    return ET.fromstring(svg)  # raises if the SVG is not well-formed XML


# --- headline chart ----------------------------------------------------------------------------------


def records():
    return [rec("contradicted"), rec("supported"), rec("unverifiable"), rec("contradicted", extractor="e2"), rec("supported", extractor="e2", judge="j2"), rec("unverifiable", judge="j2")]


def test_headline_chart_has_a_row_per_verdict_a_dot_each_and_a_ring_per_setting():
    h = headline(records())
    root = parse(headline_svg(h["overall"], h["sensitivity"]["per_setting"]))
    circles = [c for c in root.iter("{http://www.w3.org/2000/svg}circle")]
    settings = sum(1 for s in h["sensitivity"]["per_setting"].values() if s["n"])
    assert len(circles) == 3 * (1 + settings)  # one dot and one ring per setting, on each of three rows
    labels = {t.text for t in root.iter("{http://www.w3.org/2000/svg}text")}
    assert {"contradicted", "supported", "unverifiable"} <= labels


def test_headline_chart_is_labelled_and_says_what_dot_and_ring_mean():
    h = headline(records())
    svg = headline_svg(h["overall"], h["sensitivity"]["per_setting"], chart_id="x-title")
    assert 'aria-labelledby="x-title"' in svg and '<title id="x-title">' in svg and "ring: the share from one extraction prompt and checker" in svg


def test_headline_chart_of_nothing_is_empty_not_a_broken_picture():
    h = headline([])
    assert headline_svg(h["overall"], h["sensitivity"]["per_setting"]) == ""


def test_headline_chart_stays_inside_its_frame_at_the_extremes():
    h = headline([rec("contradicted")] * 5)  # every claim contradicted: share 1.0, interval up to the right edge
    root = parse(headline_svg(h["overall"], h["sensitivity"]["per_setting"], width=460))
    for c in root.iter("{http://www.w3.org/2000/svg}circle"):
        assert 0 <= float(c.get("cx")) <= 460


# --- model x month grid ------------------------------------------------------------------------------


def test_by_model_month_has_no_entry_for_a_month_a_model_did_not_run():
    out = by_model_month([rec("supported", model="a", ts="2025-06-01T00:00:00Z"), rec("contradicted", model="b", ts="2026-06-01T00:00:00Z")])
    assert set(out) == {"a", "b"} and set(out["a"]) == {"2025-06"} and set(out["b"]) == {"2026-06"}
    assert out["b"]["2026-06"]["contradicted"]["k"] == 1


def test_grid_draws_one_cell_per_model_and_month_and_marks_the_empty_ones():
    root = parse(grid_svg(["a", "b"], ["2025-06", "2026-06"], {("a", "2025-06"): (7, 0.25), ("b", "2026-06"): (3, None)}))
    ns = "{http://www.w3.org/2000/svg}"
    assert len(list(root.iter(ns + "rect"))) == 4
    texts = [t.text for t in root.iter(ns + "text")]
    assert "7 · 25%" in texts and "3" in texts and texts.count("–") == 2  # a model absent from a month shows a dash


def test_grid_cell_shading_grows_with_n_and_is_zero_when_empty():
    root = parse(grid_svg(["a"], ["m1", "m2", "m3"], {("a", "m1"): (10, 0.0), ("a", "m2"): (1, 0.0)}))
    opacities = [float(r.get("fill-opacity")) for r in root.iter("{http://www.w3.org/2000/svg}rect")]
    assert opacities[0] > opacities[1] > opacities[2] == 0.0


def test_grid_escapes_model_names_and_handles_nothing():
    assert "&lt;b&gt;" in grid_svg(["<b>"], ["2025-06"], {("<b>", "2025-06"): (1, 0.5)})
    parse(grid_svg(["<b>&"], ["2025-06"], {}))
    assert grid_svg([], ["2025-06"], {}) == "" and grid_svg(["a"], [], {}) == ""


# --- calibration -------------------------------------------------------------------------------------


def test_calibration_bins_group_by_predicted_probability_and_skip_empty_bins():
    preds = [Prediction("1", 0.05, False), Prediction("2", 0.1, False), Prediction("3", 0.9, True), Prediction("4", 1.0, True), Prediction("5", 0.85, False)]
    bins = calibration_bins(preds, n_bins=5)
    assert [b[2] for b in bins] == [2, 3]  # the middle bins are empty and left out
    assert math.isclose(bins[0][0], 0.075) and bins[0][1] == 0.0 and math.isclose(bins[1][0], (0.9 + 1.0 + 0.85) / 3) and math.isclose(bins[1][1], 2 / 3)


def test_calibration_bins_reject_zero_bins_and_handle_no_predictions():
    assert calibration_bins([], 5) == []
    try:
        calibration_bins([], 0)
    except ValueError:
        pass
    else:
        raise AssertionError("n_bins=0 should be rejected")


def test_calibration_chart_has_the_diagonal_and_a_dot_per_bin_sized_by_n():
    root = parse(calibration_svg([(0.2, 0.0, 1), (0.8, 0.75, 4)]))
    ns = "{http://www.w3.org/2000/svg}"
    circles = list(root.iter(ns + "circle"))
    assert len(circles) == 2 and float(circles[1].get("r")) > float(circles[0].get("r"))
    assert any(line.get("stroke-dasharray") for line in root.iter(ns + "line"))  # the perfect-calibration diagonal
    assert calibration_svg([]) == ""


def test_chart_legends_start_at_the_left_edge_so_they_cannot_run_off_the_right():
    """The first version put the legend at the plot's left edge and the end of the sentence was cut off."""
    h = headline(records())
    root = parse(headline_svg(h["overall"], h["sensitivity"]["per_setting"], width=460))
    ns = "{http://www.w3.org/2000/svg}"
    legends = [t for t in root.iter(ns + "text") if t.text and t.text.startswith(("dot and line", "ring:"))]
    assert len(legends) == 2 and all(float(t.get("x")) == 8 for t in legends)
    assert all(len(t.text) * 5.6 < 460 - 8 for t in legends)  # about 5.6px a character at font size 10
    grid = parse(grid_svg(["a"], ["m"], {("a", "m"): (1, 0.5)}))
    footnote = next(t for t in grid.iter(ns + "text") if t.text.startswith("each cell"))
    assert float(footnote.get("x")) == 8 and len(footnote.text) * 5.6 < float(grid.get("width"))
