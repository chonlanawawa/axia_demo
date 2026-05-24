# AXIA — Running the Demo

## Prerequisites

- [Node.js LTS](https://nodejs.org) (for the frontend)
- Anaconda / Miniconda (for the backend)
- ALL Model in [Model](https://drive.google.com/drive/folders/1bS2CxNeIoeguoyDDixypZtEw32-hz12s?usp=sharing)

---

## Step 1 — Start the Backend

Open a terminal and run:

```powershell
cd d:\Bloodclot\backend
pip install -r requirements.txt
python app.py
```

Wait until you see this in the terminal before moving on:

```
[AXIA] All models loaded ✓
[AXIA] Starting on http://localhost:5000
```

> If models fail to load you will see a warning and it will fall back to mock responses — the demo will still work.

---

## Step 2 — Start the Frontend

Open a **second terminal** and run:

```powershell
cd d:\Bloodclot\demo
npm install
npm run dev
```

Then open your browser at **http://localhost:5173**

---

## Summary

| Terminal | Command | URL |
|----------|---------|-----|
| 1 — Backend  | `cd d:\Bloodclot\backend && python app.py` | http://localhost:5000 |
| 2 — Frontend | `cd d:\Bloodclot\demo && npm run dev`      | http://localhost:5173 |

> Always start the backend first and wait for it to finish loading before opening the frontend.
