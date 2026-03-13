# BMAD × GSD — AI Agent Orchestration Framework for Claude Code

> Biến Claude Code từ "AI coder" thành "AI Team Manager" chuyên nghiệp.
> Tối ưu token, output quality, và developer experience.

## Cài đặt (30 giây)

```bash
# Copy toàn bộ vào root project
cp CLAUDE.md /path/to/your/project/
cp -r .bmad/ /path/to/your/project/.bmad/
cp -r .claude/ /path/to/your/project/.claude/
cp .claudecodeignore /path/to/your/project/

# Nếu dùng skills (optional — copy vào global)
cp -r skills/* ~/.claude/skills/
cp -r commands/* ~/.claude/commands/
```

## Quick Start

```bash
cd /path/to/your/project
claude

# Bước 1: Khởi tạo
> "Initialize BMAD for this project. Context: [mô tả dự án, mục tiêu, tech stack]"

# Bước 2: Master-Agent lên plan
> "Plan: [mô tả task cần làm]"
# → Review plan → gõ CONFIRMED

# Bước 3: Chạy sub-agents
# Mở terminal mới cho mỗi task:
> claude
> "Read .bmad/tasks/TASK_001_xxx.md and EXECUTE"

# Bước 4: Review
# Quay lại master session:
> "Review TASK_001"
```

## Tại sao Framework này?

| Vấn đề | Giải pháp |
|--------|-----------|
| Claude "quên" context khi chat dài | Context Compacting → STAGING.md → fresh session |
| Output không consistent | CONTEXT_HUB + templates + RULES.md |
| Tốn token cho context không cần thiết | Isolated sub-agent sessions + .claudecodeignore |
| Không biết "AI đang nghĩ gì" | Zero-Assumption Rule + transparent reporting |
| Kiến thức mất theo session | Knowledge Spine → git-committed wisdom |
| Ad-hoc tasks gây loãng luồng chính | Isolated adhoc/ folder |

## File Structure

```
project/
├── CLAUDE.md                    # 🧠 Brain — Master-Agent instructions
├── .claudecodeignore            # 🚫 Don't scan these folders
├── .claude/settings.json        # ⚙️ Agent Teams enabled
├── .bmad/
│   ├── CONTEXT_HUB.md          # 🎯 WHY, WHO, STANDARDS (shared context)
│   ├── MASTER_PLAN.md          # 📋 Task board + sprint status
│   ├── DICTIONARY.md           # 📖 Project terminology
│   ├── STAGING.md              # 💾 Session snapshot (for context reset)
│   ├── tasks/                  # 📝 Sub-agent task briefs
│   ├── adhoc/                  # 🔀 Out-of-sprint requests
│   ├── templates/              # 🎨 Sample outputs for reverse-engineering
│   ├── knowledge/              # 🧬 Accumulated project wisdom
│   │   ├── RULES.md            #    Extracted patterns & rules
│   │   ├── GOTCHAS.md          #    Traps & lessons learned
│   │   └── TECH_DECISIONS.md   #    Architecture Decision Records
│   └── context/                # 📦 Minimal context extracts per task
└── skills/                     # 🤖 Skill definitions (copy to ~/.claude/skills/)
    ├── master-agent/SKILL.md
    ├── sub-agent/SKILL.md
    ├── context-compactor/SKILL.md
    └── knowledge-spine/SKILL.md
```

## Workflow Diagram

```
Human cung cấp context (files, notes, screenshots, WHY)
    │
    ▼
Master-Agent (Opus) — Plan Mode
    │ Đọc context → Phân tích → Đề xuất plan
    │ ← Human review + approve (CONFIRMED)
    │
    ├── GSD Mode (<15min) ──── Master tự làm ngay
    │
    ├── Wave 1 (parallel)
    │   ├── Sub-Agent A (Sonnet) ──── TASK_001 ──── Handover ─┐
    │   └── Sub-Agent B (Opus)   ──── TASK_002 ──── Handover ─┤
    │                                                          │
    │   Master-Agent reviews ◀─────────────────────────────────┘
    │   ├── ✅ Pass → Mark done, extract knowledge
    │   └── ❌ Fail → Update task, re-run sub-agent
    │
    ├── Wave 2 (depends on Wave 1)
    │   └── Sub-Agent C (Sonnet) ──── TASK_003
    │
    ▼
Master-Agent — Wrap up
    │ Update MASTER_PLAN, knowledge, docs
    │ Context Compacting if session long
    ▼
Done (or next sprint)
```

## Tips Chuyên Nghiệp

1. **Luôn cung cấp WHY** — "Tôi cần dashboard này để thuyết phục CEO đầu tư thêm DeFi" > "Viết cái dashboard"
2. **Sample output là vũ khí** — Screenshot/HTML mẫu vào `.bmad/templates/` → Claude reverse-engineer pattern
3. **Git là Single Source of Truth** — Commit `.bmad/` → teammate `git pull` → AI của họ có toàn bộ "trí nhớ"
4. **Cross-Agent Prompting** — Cần Manus/Midjourney? Bảo Claude viết prompt cho tool đó
5. **Append, không rewrite** — Knowledge files chỉ thêm, không viết lại (tiết kiệm token)
6. **Compact khi cần** — Conversation dài? `/compact` → fresh session → không bị "ngáo"
