import json
import tempfile
from pathlib import Path

import app as app_module


def test_chat_persists_conversation_history():
    temp_dir = Path(tempfile.mkdtemp())
    app_module.DB_PATH = temp_dir / "chat_history.db"
    app_module.init_db()

    client = app_module.app.test_client()
    response = client.post("/chat", json={"message": "hello there"})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["reply"]
    assert payload["history"][0]["message"] == "hello there"

    conversation = json.loads(payload["history"][0]["conversation"])
    assert conversation[0]["role"] == "user"
    assert conversation[0]["content"] == "hello there"
    assert conversation[1]["role"] == "bot"
    assert conversation[1]["content"]
