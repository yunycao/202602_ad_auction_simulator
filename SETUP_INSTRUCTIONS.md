# Ad Auction Simulator - Setup Instructions

Your project is ready! Follow these steps to get it running on your laptop.

## Step 1: Clone or Download the Project

The project folder `ad-auction-simulator/` is ready in your outputs.

**Option A: If you have GitHub CLI:**
```bash
gh repo create ad-auction-simulator --public --source=./ad-auction-simulator --push
```

**Option B: Manual Git Setup:**
```bash
cd ad-auction-simulator
git init
git add .
git commit -m "Ad auction simulator with LLM-powered what-if analysis"
git remote add origin https://github.com/YOUR_USERNAME/ad-auction-simulator.git
git branch -M main
git push -u origin main
```

## Step 2: Set Up the Backend

```bash
cd ad-auction-simulator/backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Optional: If you have an Anthropic API key, create `.env`:
```bash
cp ../.env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

Start the backend:
```bash
uvicorn app.main:app --reload --port 8000
```

API docs will be at: http://localhost:8000/docs

## Step 3: Set Up the Frontend

Open a new terminal:
```bash
cd ad-auction-simulator/frontend
npm install
npm run dev
```

Frontend will be at: http://localhost:3000

## Features Available

✅ **Auction Dashboard**
- GSP and VCG auction mechanisms
- Revenue comparison charts
- Reserve price sensitivity analysis
- Auction winner tables

✅ **Segment Explorer**
- 8 user segments with engagement data
- Recommender model routing analysis
- Model performance radar charts

✅ **What-If Analysis**
- Natural language queries (requires API key)
- Parameter sweeps and sensitivity analysis
- Without API key: basic simulation features work

## Project Structure

```
ad-auction-simulator/
├── backend/
│   ├── app/
│   │   ├── auction/          # GSP & VCG engine
│   │   ├── simulation/       # Synthetic data (80 advertisers, 8 segments)
│   │   ├── recommender/      # Model routing logic
│   │   ├── llm/              # Claude integration
│   │   └── api/              # REST endpoints
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── AdAuctionSimulator.jsx  # React UI
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── README.md
└── .env.example
```

## Python Version

Requires: **Python 3.10+**

Check your version:
```bash
python --version
```

## All Files Included

✅ All 28 source files with Python 3.10 compatibility fixes
✅ Backend auction logic, metrics, recommender simulation
✅ Frontend React app with Recharts visualizations
✅ Unit tests for auction mechanisms
✅ Complete README with interview talking points
✅ No Meta references (cleaned per your request)

## Next Steps

1. Download the `ad-auction-simulator/` folder to your laptop
2. Follow steps 1-3 above
3. Visit http://localhost:3000 to see the interactive UI
4. (Optional) Push to GitHub when ready to share

Good luck with your IC6 interview! 🚀
