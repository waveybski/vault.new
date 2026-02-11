# Vault - Secure Ephemeral Chat

Vault is an end-to-end encrypted, anonymous, and ephemeral chat application. It ensures your conversations remain private and secure, with no permanent logs stored on the server.

## 🔗 Public Links

- **GitHub Repository:** [https://github.com/waveybski/vault.new](https://github.com/waveybski/vault.new)
- **Live Demo (Local):** [http://localhost:3000](http://localhost:3000)
- **Admin Log:** [http://localhost:3000/admin](http://localhost:3000/admin)

## 🚀 Features

- **End-to-End Encryption:** Messages are encrypted on the client side using per-room symmetric keys derived via ECDH key exchange.
- **Ephemeral Messaging:** Messages are stored in RAM only and wiped upon server restart or room "Nuke".
- **Neon DB Integration:** Tracks room creation metadata (Room ID & Timestamp) for analytics without logging message content.
- **Nuke & Web Nuke:**
  - 🗑️ **Room Nuke:** Clears all messages for all users in a specific room.
  - 💣 **Web Nuke:** Admin-only feature to wipe ALL rooms and disconnect ALL users.
- **Persistence:**
  - **Saved Rooms:** Automatically remembers joined room IDs.
  - **Message Saving (Optional):** Toggleable setting to persist chat history locally on your device.

## 🛠️ Tech Stack

- **Frontend:** Next.js (React), Tailwind CSS
- **Realtime:** Socket.IO, WebRTC (PeerJS)
- **Database:** Neon (PostgreSQL) - *Metadata only*
- **Security:** Web Crypto API (ECDH, AES-GCM)

## 📦 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/waveybski/vault.new.git
    cd vault.new
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## ⚠️ Security Note

While Vault uses strong encryption, it is a proof-of-concept application. Do not use it for critical sensitive data without a thorough security audit.
