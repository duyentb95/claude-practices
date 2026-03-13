# CONTEXT HUB — Shared Project Context

> File này là "Single Source of Truth" cho toàn bộ agents.
> Master-Agent cập nhật. Sub-agents chỉ đọc.

## WHY — Tại sao dự án này tồn tại

```
[Mô tả mục tiêu cuối cùng. Ví dụ:]
Build hệ thống tự động trading theo chiến lược momentum breakout trên Hyperliquid,
để giảm thiểu can thiệp thủ công và tăng consistency trong execution.
```

## WHO — Ai là người nhận output

```
[Ai sẽ dùng output này? Ví dụ:]
- Primary: Trader/Developer (bản thân mình) — cần code chạy được, dễ maintain
- Secondary: Team members — cần docs rõ ràng để onboard nhanh
- Stakeholders: — (nếu có)
```

## STANDARDS — Tiêu chuẩn output

### Code Standards
```
- Language: [Python 3.12+ / TypeScript / ...]
- Style: [PEP8 / ESLint / ...]
- Type hints: Required
- Testing: Unit tests cho mọi logic module
- Logging: Structured JSON (structlog / pino)
- Error handling: Custom exceptions, never swallow errors
```

### Document Standards
```
- Language: Tiếng Việt cho internal docs, English cho code comments
- Format: Markdown
- Naming: kebab-case cho files, UPPER_SNAKE cho constants
- Timestamps: UTC+7 cho display, epoch ms cho data
```

### Quality Gates
```
- Code: lint pass, tests pass, no type errors
- Docs: updated after each task
- Knowledge: lessons learned captured in .bmad/knowledge/
```

## TECH STACK

```
[Liệt kê stack chính của dự án]
```

## KEY CONSTRAINTS

```
[Những giới hạn quan trọng mà mọi agent cần biết]
```

---
*Last updated: [timestamp]*
*Updated by: [Master-Agent / Human]*
