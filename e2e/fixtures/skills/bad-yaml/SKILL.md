---
name: [unclosed
description: "this frontmatter is intentionally malformed YAML
---

# Bad YAML Skill

The frontmatter above cannot be parsed. skills-ui must not crash; metadata parsing should fall back
to the directory name gracefully.
