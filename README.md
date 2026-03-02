# RinkLink MVP

Youth hockey scheduling app for finding opponents and managing non-league games.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Seed Demo Data
Once both are running, seed demo data:
```bash
curl -X POST http://localhost:8000/api/seed
```
Or click "Seed Demo Data" on the homepage when no teams exist.

### Test Flow
1. Select a team via the team switcher dropdown
2. View schedule with open dates (Schedule page)
3. Search for opponents (Find Opponents page)
4. Propose a game from search results
5. Switch to the opponent team
6. Accept the proposal (Proposals page)
7. Verify schedule updates reflect the accepted game

## Tech Stack
- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: React + TypeScript + Vite + MUI
