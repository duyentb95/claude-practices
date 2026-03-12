"""Configuration module for the momentum trading bot.

Loads settings from config/default.yaml with environment variable overrides.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
DEFAULT_YAML = CONFIG_DIR / "default.yaml"


# --- Nested config models (pure Pydantic, no env binding) ---


class AccountConfig(BaseModel):
    testnet: bool = True


class RiskConfig(BaseModel):
    max_risk_per_trade_pct: float = 0.02
    max_leverage: int = 10
    max_concurrent_positions: int = 3
    max_positions_per_coin: int = 1
    min_rr_ratio: float = 1.0
    daily_loss_limit_pct: float = 0.05
    weekly_loss_limit_pct: float = 0.10
    max_drawdown_pct: float = 0.15
    min_account_balance: float = 500.0


class StaircaseConfig(BaseModel):
    min_lookback_candles: int = 120
    pullback_ratio_threshold: float = 0.4
    slope_consistency_threshold: float = 0.5


class VolumeConfig(BaseModel):
    increase_threshold_pct: float = 5.0


class VolatilityConfig(BaseModel):
    atr_ratio_threshold: float = 1.5
    daily_change_threshold_pct: float = 5.0


class TargetConfig(BaseModel):
    default_rr: float = 1.0
    strong_regime_rr: float = 1.5
    trailing_trigger_r: float = 0.9
    trailing_lock_r: float = 0.1


class StrategyConfig(BaseModel):
    regime_lookback_minutes: int = 120
    min_volume_per_minute_usd: int = 100000
    min_regime_score: int = 2
    candle_timeframe: str = "1m"
    limit_order_threshold_pct: float = 3.0
    stale_position_timeout_minutes: int = 120
    staircase: StaircaseConfig = Field(default_factory=StaircaseConfig)
    volume: VolumeConfig = Field(default_factory=VolumeConfig)
    volatility: VolatilityConfig = Field(default_factory=VolatilityConfig)
    targets: TargetConfig = Field(default_factory=TargetConfig)


class ScannerConfig(BaseModel):
    scan_interval_seconds: int = 300
    top_n_candidates: int = 5
    min_24h_volume_usd: int = 5_000_000


class AlertConfig(BaseModel):
    alert_on_entry: bool = True
    alert_on_exit: bool = True
    alert_on_risk_event: bool = True
    daily_summary: bool = True


# --- Top-level settings with env var support ---


class AppConfig(BaseSettings):
    """Top-level application configuration.

    Resolution order (highest priority first):
        1. Environment variables (prefixed or exact match)
        2. .env file
        3. config/default.yaml
        4. Field defaults
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Secrets / env-only fields
    hl_private_key: str = ""
    hl_account_address: str = ""
    hl_testnet: bool = True
    risk_per_trade_pct: float = 0.02
    max_leverage: int = 10
    max_concurrent_positions: int = 3
    max_daily_loss_pct: float = 0.05
    lark_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    redis_url: str = "redis://localhost:6379"

    # Structured config sections (loaded from YAML)
    account: AccountConfig = Field(default_factory=AccountConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    strategy: StrategyConfig = Field(default_factory=StrategyConfig)
    scanner: ScannerConfig = Field(default_factory=ScannerConfig)
    alerts: AlertConfig = Field(default_factory=AlertConfig)


def _load_yaml(path: Path) -> dict[str, Any]:
    """Read and parse a YAML file. Returns empty dict if file is missing."""
    if not path.exists():
        return {}
    with open(path) as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def load_config(yaml_path: Path | None = None) -> AppConfig:
    """Build AppConfig by merging YAML defaults with environment overrides.

    Args:
        yaml_path: Path to the YAML config file.  Defaults to
                   ``config/default.yaml`` relative to the package root.

    Returns:
        Fully resolved AppConfig instance.
    """
    yaml_data = _load_yaml(yaml_path or DEFAULT_YAML)

    # Environment variables handled automatically by pydantic-settings;
    # YAML values are passed as keyword init data so they act as defaults
    # that env vars can override.
    config = AppConfig(**yaml_data)

    # Propagate top-level env overrides into nested risk config so callers
    # only need to read config.risk for risk parameters.
    if config.risk_per_trade_pct != config.risk.max_risk_per_trade_pct:
        config.risk.max_risk_per_trade_pct = config.risk_per_trade_pct
    if config.max_leverage != config.risk.max_leverage:
        config.risk.max_leverage = config.max_leverage
    if config.max_concurrent_positions != config.risk.max_concurrent_positions:
        config.risk.max_concurrent_positions = config.max_concurrent_positions
    if config.max_daily_loss_pct != config.risk.daily_loss_limit_pct:
        config.risk.daily_loss_limit_pct = config.max_daily_loss_pct

    # Sync testnet flag
    config.account.testnet = config.hl_testnet

    return config
