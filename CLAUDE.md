# Project: Bank Statement Agent

## Environment
- Windows machine — always use **PowerShell** for shell commands, never Bash
- Python virtual environment: `.venv\Scripts\python.exe` (relative to project root)
- Start backend: `cd "D:\PROJECTS\bank-statement-agent"; .\.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000`
- **After every Python change: restart backend immediately.** Kill with `Stop-Process -Name python -Force` then relaunch. Always verify with `Invoke-WebRequest http://localhost:8000/health`.
- Start frontend: use `preview_start` with name `bank-statement-agent` (defined in `D:\PROJECTS\.claude\launch.json`)
- Backend runs on port 8000, frontend on port 3001
