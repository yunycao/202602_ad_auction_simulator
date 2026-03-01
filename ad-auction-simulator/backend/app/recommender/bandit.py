"""
Thompson Sampling implementation for model selection (multi-armed bandit).

Used to optimally balance exploitation (use best known model) vs
exploration (learn if other models might be better).

This is a critical concept: model routing is NOT a static decision.
It's a sequential optimization problem where each routing decision yields
information that can improve future decisions. Thompson Sampling solves
this by maintaining a posterior distribution over each model's true
performance and sampling from it to make decisions.

Key insight: The exploration rate is NOT a hyperparameter
in Thompson Sampling — it emerges naturally from posterior uncertainty.
Early on, posteriors are wide → more exploration. Over time, posteriors
narrow around the true best model → more exploitation.
"""
import random
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class BanditArm:
    """Represents one model as a bandit arm with Beta posterior."""
    arm_id: str
    arm_name: str
    successes: int = 0
    failures: int = 0
    alpha: float = 1.0  # Prior: Beta(alpha, beta) — uninformative
    beta_param: float = 1.0

    def sample(self) -> float:
        """Sample from posterior Beta(alpha + successes, beta + failures)."""
        a = self.alpha + self.successes
        b = self.beta_param + self.failures
        # Use stdlib random for reproducibility without numpy dependency
        return _beta_sample(a, b)

    def update(self, success: bool):
        """Update posterior based on observed outcome (Bayesian update)."""
        if success:
            self.successes += 1
        else:
            self.failures += 1

    def posterior_mean(self) -> float:
        """E[theta] = alpha / (alpha + beta) for Beta distribution."""
        a = self.alpha + self.successes
        b = self.beta_param + self.failures
        return a / (a + b)

    def confidence_interval(self) -> tuple:
        """Approximate 95% CI using normal approximation to Beta."""
        a = self.alpha + self.successes
        b = self.beta_param + self.failures
        mean = a / (a + b)
        var = (a * b) / ((a + b) ** 2 * (a + b + 1))
        std = math.sqrt(var) if var > 0 else 0
        return (max(0, mean - 1.96 * std), min(1, mean + 1.96 * std))

    def total_trials(self) -> int:
        return self.successes + self.failures


def _beta_sample(a: float, b: float) -> float:
    """Sample from Beta(a, b) using the gamma-based method."""
    x = random.gammavariate(a, 1.0)
    y = random.gammavariate(b, 1.0)
    if x + y == 0:
        return 0.5
    return x / (x + y)


class ThompsonSamplingRouter:
    """
    Multi-armed bandit for model selection using Thompson Sampling.

    Each model is an "arm" with a Beta posterior distribution.
    On each trial:
    1. Sample from each arm's posterior
    2. Select the arm with highest sample (optimistic)
    3. Observe reward (success/failure)
    4. Update the selected arm's posterior

    This naturally balances exploration (trying uncertain models)
    vs exploitation (using the best known model).
    """

    def __init__(self, segment_id: str, model_names: List[str]):
        self.segment_id = segment_id
        self.arms = [
            BanditArm(arm_id=f"model_{i}", arm_name=name)
            for i, name in enumerate(model_names)
        ]
        self.trial_count = 0
        self.selection_history: List[int] = []

    def select_model(self) -> int:
        """
        Select model using Thompson Sampling.

        For each model, sample from its posterior Beta distribution,
        then select the model with the highest sample.
        """
        samples = [arm.sample() for arm in self.arms]
        selected_idx = max(range(len(samples)), key=lambda i: samples[i])
        self.selection_history.append(selected_idx)
        return selected_idx

    def update(self, model_idx: int, success: bool):
        """Update posterior for selected model based on outcome."""
        self.arms[model_idx].update(success)
        self.trial_count += 1

    def get_exploration_rate(self, window: int = 20) -> float:
        """
        Compute recent exploration rate.

        Exploration = fraction of recent selections that differ from
        the empirically best model.
        """
        if len(self.selection_history) < 2:
            return 1.0

        # Find empirically best model
        best_idx = max(range(len(self.arms)), key=lambda i: self.arms[i].posterior_mean())

        recent = self.selection_history[-window:]
        non_best = sum(1 for s in recent if s != best_idx)
        return non_best / len(recent)

    def cumulative_regret(self, true_rates: Optional[List[float]] = None) -> float:
        """
        Estimate cumulative regret.

        If true_rates are known, compute exact regret.
        Otherwise, estimate using posterior means.
        """
        if true_rates:
            best_rate = max(true_rates)
            regret = 0.0
            for sel in self.selection_history:
                regret += best_rate - true_rates[sel]
            return regret

        # Estimate: use posterior means
        best_mean = max(arm.posterior_mean() for arm in self.arms)
        total_regret = 0.0
        for arm in self.arms:
            arm_regret = (best_mean - arm.posterior_mean()) * arm.total_trials()
            total_regret += max(0, arm_regret)
        return total_regret

    def summary(self) -> dict:
        """Return comprehensive summary statistics."""
        return {
            "segment_id": self.segment_id,
            "total_trials": self.trial_count,
            "exploration_rate": round(self.get_exploration_rate(), 3),
            "models": [
                {
                    "model_id": arm.arm_id,
                    "model_name": arm.arm_name,
                    "successes": arm.successes,
                    "failures": arm.failures,
                    "total_trials": arm.total_trials(),
                    "posterior_mean": round(arm.posterior_mean(), 4),
                    "confidence_interval": [round(x, 4) for x in arm.confidence_interval()],
                    "selection_pct": round(
                        sum(1 for s in self.selection_history if s == i) / max(len(self.selection_history), 1) * 100, 1
                    ),
                }
                for i, arm in enumerate(self.arms)
            ],
            "cumulative_regret": round(self.cumulative_regret(), 3),
        }


def run_bandit_simulation(
    segment_id: str,
    model_names: List[str],
    true_success_rates: List[float],
    num_trials: int = 100,
    seed: int = 42,
) -> dict:
    """
    Run a complete bandit simulation and return day-by-day results.

    Args:
        segment_id: Which segment we're routing for
        model_names: Names of the models (arms)
        true_success_rates: Hidden true success rate per model
        num_trials: Number of routing decisions to simulate
        seed: Random seed for reproducibility

    Returns:
        Dict with day-by-day results, final statistics, and insights
    """
    random.seed(seed)
    bandit = ThompsonSamplingRouter(segment_id, model_names)

    day_results = []
    cumulative_reward = 0.0
    optimal_reward = 0.0
    best_rate = max(true_success_rates)

    for day in range(num_trials):
        # Thompson Sampling selects a model
        selected_idx = bandit.select_model()

        # Observe stochastic reward
        success = random.random() < true_success_rates[selected_idx]
        bandit.update(selected_idx, success)

        cumulative_reward += (1 if success else 0)
        optimal_reward += best_rate

        day_results.append({
            "day": day + 1,
            "selected_model": model_names[selected_idx],
            "selected_idx": selected_idx,
            "success": success,
            "cumulative_reward": round(cumulative_reward, 1),
            "optimal_reward": round(optimal_reward, 1),
            "cumulative_regret": round(optimal_reward - cumulative_reward, 2),
            "exploration_rate": round(bandit.get_exploration_rate(window=min(20, day + 1)), 3),
        })

    final_stats = bandit.summary()
    final_stats["true_success_rates"] = {
        name: round(rate, 3) for name, rate in zip(model_names, true_success_rates)
    }

    return {
        "segment_id": segment_id,
        "num_trials": num_trials,
        "day_by_day": day_results,
        "final_statistics": final_stats,
        "insights": {
            "best_model_identified": model_names[
                max(range(len(bandit.arms)), key=lambda i: bandit.arms[i].posterior_mean())
            ],
            "true_best_model": model_names[true_success_rates.index(max(true_success_rates))],
            "correctly_identified": (
                max(range(len(bandit.arms)), key=lambda i: bandit.arms[i].posterior_mean())
                == true_success_rates.index(max(true_success_rates))
            ),
            "final_exploration_rate": round(bandit.get_exploration_rate(), 3),
            "total_regret": round(optimal_reward - cumulative_reward, 2),
            "regret_pct": round(
                (optimal_reward - cumulative_reward) / max(optimal_reward, 1) * 100, 1
            ),
        },
    }
