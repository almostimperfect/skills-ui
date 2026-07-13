---
name: spaced skill
description: Directory and name contain a space — exercises URL-encoding in API routes and the web client.
---

# Spaced Skill

The directory name contains a space. `encodeURIComponent` paths in src/web/api.ts and the
`:name` route params must round-trip this correctly.
