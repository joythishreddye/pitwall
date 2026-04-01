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
Run both frontend and backend test suites sequentially. Report any failures with file paths and error messages.

If no argument is provided, detect which files were recently changed (check `git diff --name-only`) and run the relevant test suite. If changes span both frontend/ and backend/, run both.
