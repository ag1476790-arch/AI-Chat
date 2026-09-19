import json
import os
import sqlite3
import tempfile
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()
app = Flask(__name__)
DB_PATH = Path(
    Path(tempfile.gettempdir()) / "chat_history.db"
    if os.getenv("VERCEL")
    else Path(__file__).with_name("chat_history.db")
)
API_PROVIDER = "openrouter"
API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "inclusionai/ling-3.0-flash-vl:free",
)

if not API_KEY:
    app.config["AI_READY"] = False
else:
    app.config["AI_READY"] = True


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                conversation TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        try:
            conn.execute(
                "ALTER TABLE search_history ADD COLUMN conversation TEXT DEFAULT '[]'"
            )
        except sqlite3.OperationalError:
            pass
        conn.commit()


def get_recent_history(limit=8):
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT id, message, conversation FROM search_history ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    history = []
    for row in rows:
        conversation = row["conversation"] or "[]"
        try:
            parsed = json.loads(conversation)
        except (TypeError, ValueError):
            parsed = []
        history.append(
            {
                "id": row["id"],
                "message": row["message"],
                "conversation": parsed,
            }
        )
    return history


def call_openrouter(message):
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": message}],
        "temperature": 0.7,
        "max_tokens": 250,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + API_KEY,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "Chat Assistant",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))

        text = result.get("choices", [{}])[0].get("message", {}).get("content")

        if text:
            return text.strip()
        return "OpenRouter responded, but no text was returned."

    except urllib_error.HTTPError as exc:
        details = exc.read().decode("utf-8", "ignore")
        return f"OpenRouter API error: {details[:250]}"
    except Exception as exc:
        return f"Could not reach OpenRouter: {exc}"


def get_ai_reply(message):
    if not app.config.get("AI_READY"):
        return "AI is not configured yet. Set OPENROUTER_API_KEY in the environment and restart the app."

    if API_PROVIDER == "openrouter":
        return call_openrouter(message)

    return f"The app is set to '{API_PROVIDER}', but OpenRouter is the configured provider."


init_db()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/history")
def history():
    return jsonify({"history": get_recent_history()})


@app.patch("/history/<int:history_id>")
def rename_history(history_id):
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "A history name is required."}), 400

    with get_db_connection() as conn:
        result = conn.execute(
            "UPDATE search_history SET message = ? WHERE id = ?",
            (message, history_id),
        )
        conn.commit()

    if result.rowcount == 0:
        return jsonify({"error": "History entry not found."}), 404

    return jsonify({"history": get_recent_history()})


@app.delete("/history/<int:history_id>")
def delete_history(history_id):
    with get_db_connection() as conn:
        result = conn.execute(
            "DELETE FROM search_history WHERE id = ?",
            (history_id,),
        )
        conn.commit()

    if result.rowcount == 0:
        return jsonify({"error": "History entry not found."}), 404

    return jsonify({"history": get_recent_history()})


@app.post("/chat")
def chat():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    conversation = data.get("conversation") or []

    if not message:
        return jsonify({"reply": "Please type a message first."}), 400

    if not isinstance(conversation, list):
        conversation = []

    safe_conversation = []
    for item in conversation:
        if isinstance(item, dict) and "role" in item and "content" in item:
            safe_conversation.append({
                "role": item["role"],
                "content": str(item["content"]),
            })

    safe_conversation.append({"role": "user", "content": message})
    reply = get_ai_reply(message)
    safe_conversation.append({"role": "bot", "content": reply})

    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO search_history (message, conversation) VALUES (?, ?)",
            (message, json.dumps(safe_conversation)),
        )
        conn.commit()

    return jsonify({
        "reply": reply,
        "conversation": safe_conversation,
        "history": get_recent_history(),
    })


if __name__ == "__main__":
    app.run(debug=True)
