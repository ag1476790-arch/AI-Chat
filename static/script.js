const messageInput = document.getElementById("message");
const chatBox = document.getElementById("chat-box");
const historyList = document.getElementById("history-list");
const chatForm = document.getElementById("chat-form");
const historyContextMenu = document.getElementById("history-context-menu");
const renameHistoryAction = document.getElementById("rename-history-action");
const deleteHistoryAction = document.getElementById("delete-history-action");
let contextHistoryEntry = null;

async function loadHistory() {
    try {
        const response = await fetch("/history");
        if (!response.ok) {
            throw new Error("Unable to load history");
        }

        const data = await response.json();
        const history = data.history || [];

        historyList.innerHTML = "";

        if (!history.length) {
            const empty = document.createElement("div");
            empty.className = "empty-history";
            empty.textContent = "No searches yet";
            historyList.appendChild(empty);
            return;
        }

        history.forEach((entry) => {
            const row = document.createElement("div");
            row.className = "history-row";

            const selectButton = document.createElement("button");
            selectButton.type = "button";
            selectButton.className = "history-item";
            selectButton.textContent = entry.message.length > 40
                ? `${entry.message.slice(0, 40)}...`
                : entry.message;
            selectButton.title = "Set this message in the chat box";
            selectButton.addEventListener("click", () => {
                messageInput.value = entry.message;
                messageInput.focus();
            });

            row.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                contextHistoryEntry = entry;
                showHistoryContextMenu(event.clientX, event.clientY);
            });

            row.append(selectButton);
            historyList.appendChild(row);
        });
    } catch (error) {
        console.error(error);
    }
}

async function updateHistory(id, method, message) {
    const options = { method, headers: {} };

    if (message) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ message });
    }

    try {
        const response = await fetch(`/history/${id}`, options);
        if (!response.ok) {
            throw new Error("Unable to update history");
        }

        await loadHistory();
    } catch (error) {
        console.error(error);
        window.alert("Could not update this history entry.");
    }
}

function showHistoryContextMenu(x, y) {
    historyContextMenu.hidden = false;
    historyContextMenu.style.left = `${Math.min(x, window.innerWidth - historyContextMenu.offsetWidth - 8)}px`;
    historyContextMenu.style.top = `${Math.min(y, window.innerHeight - historyContextMenu.offsetHeight - 8)}px`;
}

function hideHistoryContextMenu() {
    historyContextMenu.hidden = true;
    contextHistoryEntry = null;
}

renameHistoryAction.addEventListener("click", async () => {
    if (!contextHistoryEntry) {
        return;
    }

    const entry = contextHistoryEntry;
    hideHistoryContextMenu();
    const name = window.prompt("Rename history entry:", entry.message);
    if (name && name.trim()) {
        await updateHistory(entry.id, "PATCH", name.trim());
    }
});

deleteHistoryAction.addEventListener("click", async () => {
    if (!contextHistoryEntry) {
        return;
    }

    const entry = contextHistoryEntry;
    hideHistoryContextMenu();
    if (window.confirm("Delete this history entry?")) {
        await updateHistory(entry.id, "DELETE");
    }
});

document.addEventListener("click", (event) => {
    if (!historyContextMenu.contains(event.target)) {
        hideHistoryContextMenu();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        hideHistoryContextMenu();
    }
});

function addMessage(message, type) {
    const messageElement = document.createElement("div");

    if (type === "user") {
        messageElement.className = "user-message";
        messageElement.innerHTML = `<b>You:</b> ${message}`;
    } else {
        messageElement.className = "bot-message";
        messageElement.innerHTML = `<b>Assistant:</b> ${message}`;
    }

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage(event) {
    if (event) {
        event.preventDefault();
    }

    const message = messageInput.value.trim();
    if (!message) {
        return;
    }

    addMessage(message, "user");
    messageInput.value = "";

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            throw new Error("Server error");
        }

        const data = await response.json();
        addMessage(data.reply, "bot");
        await loadHistory();
    } catch (error) {
        console.error("Error:", error);
        addMessage("Sorry, something went wrong. Please try again.", "bot");
    }
}

chatForm.addEventListener("submit", sendMessage);

document.querySelector(".new-chat-btn").addEventListener("click", () => {
    chatBox.innerHTML = '<div class="bot-message"><b>Assistant:</b> Hello! How can I help you today?</div>';
    messageInput.focus();
});

loadHistory();
