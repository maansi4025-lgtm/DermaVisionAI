# DermaVision AI

AI-assisted skin lesion screening: a React frontend, a FastAPI backend, an EfficientNet-B0 classifier with Grad-CAM
heatmaps, a patient chat assistant with voice (English and Hindi), login with Google, password reset, and a training
pipeline for the HAM10000 dataset.

> Screening and education only. Not a medical device and not a substitute for a dermatologist.

```
DermaVisionAI/
├── frontend/             React + Vite app
├── backend/              FastAPI server, database, chatbot, model inference, tests
├── ml/                   training and evaluation scripts + Colab and Kaggle notebooks
├── start-backend.bat     Windows: double-click to run the backend
├── start-frontend.bat    Windows: double-click to run the frontend
├── start-all.bat         Windows: runs both and opens the browser
└── docker-compose.yml    optional: PostgreSQL + API
```

## 1. Install once (Windows)
1. **Python 3.12 or 3.13** from python.org. On the first screen tick **"Add python.exe to PATH"**.
2. **Node.js LTS** from nodejs.org.
3. Restart VS Code / PowerShell afterwards.

## 2. Run
Double-click **`start-all.bat`**. The first run installs everything (a few minutes) and opens http://localhost:5173.
Or run them separately: `start-backend.bat`, then `start-frontend.bat`.

Manual commands (any OS):
```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
```
Check: http://localhost:8000/api/health must show `"status":"ok"`, and the app must be opened at **http://localhost:5173**.

## 3. Configure (`backend/.env` and `frontend/.env`)
Everything is optional except `JWT_SECRET`. Restart the backend after editing `backend/.env`, and restart the frontend after editing `frontend/.env`.

| Setting | Meaning |
|---|---|
| `DATABASE_URL` | Default `sqlite:///./dermavision.db` (no setup). A hosted `postgresql://...` URL also works (`pip install psycopg2-binary`). |
| `JWT_SECRET` | Any long random text: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DEMO_MODE` | `true` = fake, clearly labelled predictions until you add a trained model. Set `false` once `backend/weights/dermavision_effnet_b0.pt` exists. |
| `LLM_PROVIDER`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_*` | Chatbot brain. Leave empty for the built-in English/Hindi question flow. |
| `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` | Enables "Continue with Google" (same Client ID in both files). |
| `SMTP_*` | Real password-reset emails. Empty = the reset link is printed in the backend window. |
| `CORS_ORIGINS`, `ALLOW_LOCAL_DEV_ORIGINS` | Allowed web addresses. In development any `localhost` / `127.0.0.1` port is accepted. |
| `VITE_USE_MOCK` (frontend) | `false` = real backend (default). `true` = fake demo data, no backend needed. |

## 4. Train the model
See [`ml/README.md`](ml/README.md). Easiest: upload `ml/DermaVision_Training_Kaggle.ipynb` to a Kaggle notebook (free GPU, dataset is
already there), run all cells, download `dermavision_effnet_b0.pt` into `backend/weights/`, set `DEMO_MODE=false`, restart the backend.
Treat the numbers as optimistic: the model learned from dermoscope images, so phone photos will usually score worse.

## 5. Features and where they live
| Feature | Files |
|---|---|
| REST API: auth, scans, history, reports, dashboard | `backend/app/routers/` |
| Login with JWT (memory) + httpOnly refresh cookie, Google sign-in, forgot/reset password | `backend/app/routers/auth.py`, `frontend/src/pages/{Login,ForgotPassword,ResetPassword}.jsx` |
| EfficientNet-B0 inference + Grad-CAM, risk logic | `backend/app/services/classifier.py`, `lesion_info.py` |
| Chat assistant: Gemini / Claude / Ollama / built-in flow, English + Hindi, safety triage | `backend/app/services/chatbot.py`, `frontend/src/pages/Assistant.jsx` |
| Voice in/out and voice commands | `frontend/src/hooks/useSpeech.js`, `frontend/src/utils/voiceCommands.js` |
| Training and evaluation | `ml/` |

Chat safety (always on, in code): emergency phrases get a fixed "call 112" reply without calling any AI; warning symptoms can only
raise the urgency (routine / soon / urgent); a high-risk scan sets a minimum of "soon".

## 6. Troubleshooting
| Symptom | Fix |
|---|---|
| "Cannot reach the server" banner on the login page | The backend is not running, or crashed. Run `start-backend.bat` and read its last lines. |
| Browser console: "blocked by CORS policy" | Restart the backend (it reads `.env` only at startup). Make sure you edited the backend you are running (check you do not have two copies of the project). |
| Frontend says port 5173 is in use | An old frontend is still running. Close its window (Ctrl+C), then start again. The app deliberately stays on 5173. |
| `No module named 'psycopg'` | Your `DATABASE_URL` is a PostgreSQL URL. Use the SQLite default, or `pip install psycopg2-binary`. |
| Chat always uses the simple flow | The terminal prints why on one line: `LLM call failed (gemini): HTTP ...`. 503 = Google overloaded (retry later), 400/403 = bad key, 404 = bad model name. |
| Google button says it is not set up | Add the Client ID to both `.env` files and restart both servers. |
| Hindi voice is silent or English | Install a Hindi voice in Windows Settings > Time & language > Speech. |

## 7. Tests and quality checks
```bash
cd backend && pip install pytest httpx && pytest        # 31 tests
cd frontend && npm run build && npm run lint
```

## 8. Before real use
Set a strong `JWT_SECRET`, `COOKIE_SECURE=true` behind HTTPS, `ALLOW_LOCAL_DEV_ORIGINS=false`, add rate limiting on `/api/auth/*`
and `/api/chat/*`, serve scan images through authenticated URLs (currently `/media/<random-id>.jpg` is unguessable but public), use
Alembic migrations, and get consent before sending patient chat text to any AI provider. Do not use this app for medical decisions.
