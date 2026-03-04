# Agent System Setup

## Cài đặt nhanh

Copy toàn bộ nội dung vào root project:

```bash
# Copy CLAUDE.md (MERGE với CLAUDE.md hiện tại, không replace)
# Copy thư mục .claude/ vào root project

cp -r .claude/ /path/to/your/project/.claude/
```

**QUAN TRỌNG**: File `CLAUDE.md` mới đã bao gồm toàn bộ nội dung CLAUDE.md cũ + thêm phần Agent System. Bạn có thể replace trực tiếp hoặc merge thủ công.

## File Structure

```
.claude/
├── settings.json              # Bật Agent Teams experimental feature
├── agents/
│   ├── data-fetcher.md        # Fetch data từ Hyperliquid API
│   ├── wallet-clusterer.md    # Cluster related wallets
│   ├── pattern-scorer.md      # Score insider trading probability
│   ├── report-writer.md       # Generate Markdown reports
│   └── code-dev.md            # Write/modify TypeScript code
└── commands/
    ├── investigate.md          # /investigate <wallet_address>
    ├── scan-token.md           # /scan-token <TOKEN>
    ├── daily-report.md         # /daily-report
    └── team-analyze.md         # /team-analyze <mô tả task>
```

## Yêu cầu

1. **Claude Code CLI** đã cài và login
2. **Claude Max plan** (khuyến nghị — agent teams tốn nhiều tokens)
3. **tmux** đã cài (để xem mỗi agent trong 1 pane riêng)

## Cách dùng

### Bật Agent Teams (1 lần duy nhất)

File `.claude/settings.json` đã có config. Hoặc chạy manual:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### Dùng Slash Commands

```bash
cd /path/to/project
tmux new -s hl-agents    # Khuyến nghị chạy trong tmux
claude                    # Start Claude Code

# Trong Claude Code session:
/investigate 0x1234567890abcdef1234567890abcdef12345678
/scan-token HYPE
/daily-report
/team-analyze Phân tích 5 token mới list tuần này tìm insider
```

### Dùng Subagents trực tiếp

```
> Dùng data-fetcher lấy toàn bộ trades của wallet 0xABC trong 7 ngày qua

> Dùng pattern-scorer score wallet 0xABC, data đã có trong data/raw/wallets/0xABC/

> Dùng report-writer tạo báo cáo từ scores trong data/analysis/scores/HYPE.json
```

### Dùng Agent Teams trực tiếp

```
> Tạo agent team phân tích token PURR:
> - data-fetcher lấy trades 14 ngày
> - wallet-clusterer tìm related wallets
> - pattern-scorer score tất cả
> Report khi xong.
```

## Tạo thư mục data (lần đầu)

```bash
mkdir -p data/{raw,processed,cache,analysis/{clusters,scores,timelines}}
mkdir -p reports/{daily,investigations,alerts}
echo "data/" >> .gitignore
echo "reports/" >> .gitignore
```

## Tips

- **Bắt đầu với /investigate**: Test 1 wallet trước để quen workflow
- **Check agents**: Gõ `/agents` trong Claude Code để xem danh sách agents
- **Monitor**: Dùng tmux split-pane để xem từng agent real-time
- **Token cost**: 1 subagent ~50-100K tokens, 1 agent team 3 members ~300-500K tokens
- **Lần đầu chậm**: Teammates spawn mất 20-30 giây
