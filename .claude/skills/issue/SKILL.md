---
name: issue
description: Create a GitHub issue from the current context. Pass the issue title as argument.
---

Create a GitHub issue for the PitWall project.

**Title:** $ARGUMENTS

**Steps:**
1. Analyze the current context (recent conversation, files being worked on, errors encountered)
2. Determine the appropriate label: `bug`, `enhancement`, `frontend`, `backend`, `ml`, `documentation`
3. Write a clear issue body with:
   - Summary of the issue/feature
   - Relevant code context (file paths, function names)
   - Acceptance criteria (for features) or reproduction steps (for bugs)
4. Create the issue:
```bash
gh issue create --repo joythishreddye/pitwall --title "..." --body "..." --label "..."
```
5. Report the issue URL back to the user
