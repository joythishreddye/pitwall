---
name: test
description: Run tests for the project. Pass 'frontend', 'backend', or 'all' as argument.
---

Run the appropriate test suite based on the argument: $ARGUMENTS

**Frontend tests:**
```bash
cd frontend && pnpm test
```

**Backend tests:**
```bash
cd backend && pytest -v --cov=app --cov-report=term-missing
```

**All tests:**
Run both sequentially. Report any failures clearly with file paths and error messages.

If no argument is provided, detect which files were recently changed and run the relevant test suite.
