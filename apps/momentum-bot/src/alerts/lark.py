"""Lark webhook notifications for the momentum trading bot.

Sends interactive message cards to a Lark (Feishu) group via webhook.
Each alert type uses a distinct colour header for quick visual triage.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import aiohttp

from src.strategy.models import ManagedPosition, Signal, SignalDirection
from src.utils.logger import get_logger

log = get_logger(__name__)

# Lark card header colours.
_GREEN = "green"
_RED = "red"
_ORANGE = "orange"
_GREY = "grey"


class LarkAlerter:
    """Sends trading alerts to a Lark group webhook."""

    def __init__(self, webhook_url: str | None) -> None:
        self.webhook_url = webhook_url
        self.enabled = bool(webhook_url)

    # ------------------------------------------------------------------
    # Public alert methods
    # ------------------------------------------------------------------

    async def send_entry_alert(self, signal: Signal, position: ManagedPosition) -> None:
        """Send an entry notification (green card).

        Includes coin, direction, entry price, stop-loss, take-profit,
        regime score, and reward-to-risk ratio.
        """
        if not self.enabled:
            return

        direction_emoji = "LONG" if signal.direction == SignalDirection.LONG else "SHORT"
        risk = abs(signal.entry_price - signal.stop_loss)

        fields: list[dict[str, str]] = [
            {"tag": "text", "text": f"Coin: {signal.coin}"},
            {"tag": "text", "text": f"Direction: {direction_emoji}"},
            {"tag": "text", "text": f"Entry: {signal.entry_price:.6g}"},
            {"tag": "text", "text": f"Stop Loss: {signal.stop_loss:.6g}"},
            {"tag": "text", "text": f"Take Profit: {signal.take_profit:.6g}"},
            {"tag": "text", "text": f"Risk: {risk:.6g}  |  R:R = {signal.rr_ratio:.2f}"},
            {"tag": "text", "text": f"Regime Score: {signal.regime_score}/5"},
            {"tag": "text", "text": f"Size: {position.size:.6g} ({position.notional_usd:.2f} USD)"},
            {"tag": "text", "text": f"Leverage: {position.leverage}x"},
        ]

        card = self._build_card(
            title=f"Entry: {signal.coin} {direction_emoji}",
            colour=_GREEN,
            fields=fields,
        )
        await self._send(card)

    async def send_exit_alert(
        self,
        position: ManagedPosition,
        exit_price: float,
        reason: str,
        pnl: float,
    ) -> None:
        """Send an exit notification.

        Green card for profitable exits, red card for losses.
        """
        if not self.enabled:
            return

        colour = _GREEN if pnl >= 0 else _RED
        pnl_sign = "+" if pnl >= 0 else ""
        direction_label = "LONG" if position.is_long else "SHORT"
        pnl_pct = (pnl / position.notional_usd * 100) if position.notional_usd > 0 else 0.0

        fields: list[dict[str, str]] = [
            {"tag": "text", "text": f"Coin: {position.coin}"},
            {"tag": "text", "text": f"Direction: {direction_label}"},
            {"tag": "text", "text": f"Entry: {position.entry_price:.6g}"},
            {"tag": "text", "text": f"Exit: {exit_price:.6g}"},
            {"tag": "text", "text": f"Reason: {reason}"},
            {"tag": "text", "text": f"PnL: {pnl_sign}{pnl:.2f} USD ({pnl_sign}{pnl_pct:.2f}%)"},
        ]

        card = self._build_card(
            title=f"Exit: {position.coin} {direction_label}",
            colour=colour,
            fields=fields,
        )
        await self._send(card)

    async def send_risk_alert(self, message: str) -> None:
        """Send a risk event notification (orange card).

        Used for daily loss limit breaches, drawdown warnings, etc.
        """
        if not self.enabled:
            return

        fields: list[dict[str, str]] = [
            {"tag": "text", "text": message},
        ]

        card = self._build_card(
            title="Risk Alert",
            colour=_ORANGE,
            fields=fields,
        )
        await self._send(card)

    async def send_daily_summary(self, stats: dict[str, Any]) -> None:
        """Send a daily summary card (grey).

        Expects stats keys: total_pnl, win_rate, trades_taken,
        open_positions, account_balance.
        """
        if not self.enabled:
            return

        total_pnl = stats.get("total_pnl", 0.0)
        win_rate = stats.get("win_rate", 0.0)
        trades_taken = stats.get("trades_taken", 0)
        open_positions = stats.get("open_positions", 0)
        account_balance = stats.get("account_balance", 0.0)
        pnl_sign = "+" if total_pnl >= 0 else ""

        fields: list[dict[str, str]] = [
            {"tag": "text", "text": f"Daily PnL: {pnl_sign}{total_pnl:.2f} USD"},
            {"tag": "text", "text": f"Win Rate: {win_rate:.1f}%"},
            {"tag": "text", "text": f"Trades Taken: {trades_taken}"},
            {"tag": "text", "text": f"Open Positions: {open_positions}"},
            {"tag": "text", "text": f"Account Balance: {account_balance:.2f} USD"},
        ]

        card = self._build_card(
            title="Daily Summary",
            colour=_GREY,
            fields=fields,
        )
        await self._send(card)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _build_card(
        self,
        title: str,
        colour: str,
        fields: list[dict[str, str]],
    ) -> dict[str, Any]:
        """Build a Lark interactive message card payload.

        Lark card format reference:
        https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message-content-description/interactive
        """
        now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        elements: list[dict[str, Any]] = []
        for f in fields:
            elements.append(
                {
                    "tag": "div",
                    "text": {
                        "tag": "plain_text",
                        "content": f["text"],
                    },
                }
            )

        # Footer with timestamp.
        elements.append(
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": f"Momentum Bot | {now_str}",
                    }
                ],
            }
        )

        return {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {
                        "tag": "plain_text",
                        "content": title,
                    },
                    "template": colour,
                },
                "elements": elements,
            },
        }

    async def _send(self, card: dict[str, Any]) -> None:
        """POST the card payload to the Lark webhook URL.

        Errors are logged but never raised -- alerts must not crash the bot.
        """
        if not self.webhook_url:
            return

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.webhook_url,
                    json=card,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        log.warning(
                            "lark_webhook_failed",
                            status=resp.status,
                            body=body[:500],
                        )
                    else:
                        log.debug("lark_alert_sent", title=card.get("card", {}).get("header", {}).get("title", {}).get("content", ""))
        except Exception:
            log.exception("lark_webhook_error")
