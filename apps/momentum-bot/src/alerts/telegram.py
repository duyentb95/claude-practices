"""Telegram bot notifications for the momentum trading bot.

Sends messages via the Telegram Bot API (sendMessage endpoint).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import aiohttp

from src.strategy.models import ManagedPosition, Signal, SignalDirection
from src.utils.logger import get_logger

log = get_logger(__name__)

_TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramAlerter:
    """Sends trading alerts to a Telegram chat via the Bot API."""

    def __init__(self, bot_token: str | None, chat_id: str | None) -> None:
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.enabled = bool(bot_token and chat_id)

    # ------------------------------------------------------------------
    # Public alert methods
    # ------------------------------------------------------------------

    async def send_message(self, text: str, parse_mode: str = "HTML") -> None:
        """Send a plain text message to the configured chat.

        Args:
            text: Message body (HTML or plain text).
            parse_mode: Telegram parse mode -- "HTML" or "MarkdownV2".
        """
        if not self.enabled:
            return

        await self._post_send_message(text=text, parse_mode=parse_mode)

    async def send_entry_alert(self, signal: Signal, position: ManagedPosition) -> None:
        """Send an entry notification with trade details."""
        if not self.enabled:
            return

        direction = "LONG" if signal.direction == SignalDirection.LONG else "SHORT"
        risk = abs(signal.entry_price - signal.stop_loss)

        text = (
            f"<b>Entry: {signal.coin} {direction}</b>\n"
            f"\n"
            f"Entry: <code>{signal.entry_price:.6g}</code>\n"
            f"Stop Loss: <code>{signal.stop_loss:.6g}</code>\n"
            f"Take Profit: <code>{signal.take_profit:.6g}</code>\n"
            f"Risk: <code>{risk:.6g}</code>  |  R:R = <code>{signal.rr_ratio:.2f}</code>\n"
            f"Regime Score: <code>{signal.regime_score}/5</code>\n"
            f"Size: <code>{position.size:.6g}</code> ({position.notional_usd:.2f} USD)\n"
            f"Leverage: <code>{position.leverage}x</code>\n"
            f"\n"
            f"<i>{_timestamp_footer()}</i>"
        )

        await self._post_send_message(text=text, parse_mode="HTML")

    async def send_exit_alert(
        self,
        position: ManagedPosition,
        exit_price: float,
        reason: str,
        pnl: float,
    ) -> None:
        """Send an exit notification with PnL details."""
        if not self.enabled:
            return

        direction = "LONG" if position.is_long else "SHORT"
        pnl_sign = "+" if pnl >= 0 else ""
        pnl_pct = (pnl / position.notional_usd * 100) if position.notional_usd > 0 else 0.0
        result_label = "WIN" if pnl >= 0 else "LOSS"

        text = (
            f"<b>Exit: {position.coin} {direction} -- {result_label}</b>\n"
            f"\n"
            f"Entry: <code>{position.entry_price:.6g}</code>\n"
            f"Exit: <code>{exit_price:.6g}</code>\n"
            f"Reason: {reason}\n"
            f"PnL: <code>{pnl_sign}{pnl:.2f} USD ({pnl_sign}{pnl_pct:.2f}%)</code>\n"
            f"\n"
            f"<i>{_timestamp_footer()}</i>"
        )

        await self._post_send_message(text=text, parse_mode="HTML")

    async def send_daily_summary(self, stats: dict[str, Any]) -> None:
        """Send a daily performance summary."""
        if not self.enabled:
            return

        total_pnl = stats.get("total_pnl", 0.0)
        win_rate = stats.get("win_rate", 0.0)
        trades_taken = stats.get("trades_taken", 0)
        open_positions = stats.get("open_positions", 0)
        account_balance = stats.get("account_balance", 0.0)
        pnl_sign = "+" if total_pnl >= 0 else ""

        text = (
            f"<b>Daily Summary</b>\n"
            f"\n"
            f"PnL: <code>{pnl_sign}{total_pnl:.2f} USD</code>\n"
            f"Win Rate: <code>{win_rate:.1f}%</code>\n"
            f"Trades: <code>{trades_taken}</code>\n"
            f"Open Positions: <code>{open_positions}</code>\n"
            f"Balance: <code>{account_balance:.2f} USD</code>\n"
            f"\n"
            f"<i>{_timestamp_footer()}</i>"
        )

        await self._post_send_message(text=text, parse_mode="HTML")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _post_send_message(self, text: str, parse_mode: str) -> None:
        """POST to the Telegram sendMessage endpoint.

        Errors are logged but never raised -- alerts must not crash the bot.
        """
        if not self.bot_token or not self.chat_id:
            return

        url = f"{_TELEGRAM_API_BASE}/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        log.warning(
                            "telegram_send_failed",
                            status=resp.status,
                            body=body[:500],
                        )
                    else:
                        log.debug("telegram_message_sent")
        except Exception:
            log.exception("telegram_send_error")


def _timestamp_footer() -> str:
    """Return a UTC timestamp string for message footers."""
    return f"Momentum Bot | {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
