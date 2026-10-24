from eval.forecaster import Prediction, accuracy, auc, base_rate_predictor, brier_score, score_forecaster


def test_base_rate_predictor_is_the_outcome_mean():
    preds = [Prediction("1", 0.9, True), Prediction("2", 0.1, False), Prediction("3", 0.6, True)]
    assert base_rate_predictor(preds) == 2 / 3


def test_brier_score_is_zero_for_perfect_predictions():
    preds = [Prediction("1", 1.0, True), Prediction("2", 0.0, False)]
    assert brier_score(preds) == 0.0


def test_brier_score_worst_case():
    preds = [Prediction("1", 0.0, True), Prediction("2", 1.0, False)]
    assert brier_score(preds) == 1.0


def test_accuracy_at_default_threshold():
    preds = [Prediction("1", 0.9, True), Prediction("2", 0.4, False), Prediction("3", 0.6, False)]
    assert accuracy(preds) == 2 / 3


def test_auc_perfect_separation():
    preds = [Prediction("1", 0.9, True), Prediction("2", 0.8, True), Prediction("3", 0.1, False)]
    assert auc(preds) == 1.0


def test_auc_none_without_both_classes():
    preds = [Prediction("1", 0.9, True), Prediction("2", 0.8, True)]
    assert auc(preds) is None


def test_score_forecaster_includes_base_rate_comparison():
    preds = [Prediction("1", 0.9, True), Prediction("2", 0.1, False)]
    result = score_forecaster(preds)
    assert result["n"] == 2
    assert result["base_rate"] == 0.5
    assert result["brier"] < result["brier_base_rate"]  # the forecaster beats a constant guess here
