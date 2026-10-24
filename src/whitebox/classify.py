import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

def evaluate(X, y, cv=5):
    #  trains and evaluates a classifier on features X & labels y
    X, y = np.asarray(X), np.asarray(y)
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.1))
    acc = cross_val_score(clf, X, y, cv=cv, scoring='accuracy')
    auc = cross_val_score(clf, X, y, cv=cv, scoring='roc_auc')
    # leakage sanity check
    shuf = cross_val_score(clf, X, np.random.permutation(y), cv=cv, scoring='accuracy')
    return {
        "accuracy": acc.mean(), "accuracy_std": acc.std(),
        "auc": auc.mean(), "auc_std": auc.std(),
        "shuffled_accuracy": shuf.mean(),
    }

def train_final(X, y):
    # train on all data and return the fitted classifier for scoring
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.1))
    return clf.fit(np.asarray(X), np.asarray(y))