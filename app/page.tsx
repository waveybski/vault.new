
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Chat from "@/components/Chat";
import { Clock, Trash2, Settings } from "lucide-react";

interface SavedRoom {
  id: string;
  lastActive: number;
}

function ChatEntry() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");
  const [userId] = useState(uuidv4());
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>([]);
  const [saveMessages, setSaveMessages] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const room = searchParams.get("room");
    if (room) {
      setRoomId(room);
    }
    
    // Load saved rooms
    const saved = localStorage.getItem("vault_rooms");
    if (saved) {
        try {
            setSavedRooms(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load saved rooms", e);
        }
    }
    
    // Load settings
    const settings = localStorage.getItem("vault_settings");
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            if (typeof parsed.saveMessages === 'boolean') setSaveMessages(parsed.saveMessages);
        } catch (e) {}
    }
  }, [searchParams]);

  const handleJoin = (id: string = roomId) => {
      if (!id || !username) return;
      
      // Always save room ID to history
      const newSaved = savedRooms.filter(r => r.id !== id);
      newSaved.unshift({ id, lastActive: Date.now() });
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));
      
      setRoomId(id);
      setJoined(true);
  };

  const deleteRoom = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSaved = savedRooms.filter(r => r.id !== id);
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));
      // Also clear saved messages for this room
      localStorage.removeItem(`vault_msgs_${id}`);
  };

  const toggleSettings = () => {
      const newState = !saveMessages;
      setSaveMessages(newState);
      localStorage.setItem("vault_settings", JSON.stringify({ saveMessages: newState }));
      if (!newState) {
          if (confirm("Turn off message persistence? This will NOT delete existing saved messages, but new ones won't be saved.")) {
              // Optional: Clear all saved messages? No, user just said stop saving.
          } else {
              setSaveMessages(true); // Revert if cancelled
              localStorage.setItem("vault_settings", JSON.stringify({ saveMessages: true }));
          }
      }
  };

  if (joined) {
    return <Chat roomId={roomId} userId={userId} username={username} saveMessages={saveMessages} onLeave={() => setJoined(false)} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center relative">
          <h1 className="text-4xl font-bold tracking-tight text-green-500">Vault</h1>
          <p className="mt-2 text-sm text-gray-400">
            End-to-End Encrypted. Anonymous. Ephemeral.
          </p>
          <button 
            onClick={toggleSettings}
            className={`absolute top-0 right-0 p-2 rounded-full ${saveMessages ? 'text-green-500' : 'text-gray-600'}`}
            title={saveMessages ? "Messages Saving ON" : "Messages Saving OFF"}
          >
              <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <input
                type="text"
                required
                className="relative block w-full rounded-md border-0 bg-gray-900 py-3 px-3 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-green-500 sm:text-sm sm:leading-6"
                placeholder="Display Name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <input
                type="text"
                required
                className="relative block w-full rounded-md border-0 bg-gray-900 py-3 px-3 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-green-500 sm:text-sm sm:leading-6"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => handleJoin(roomId)}
              disabled={!roomId || !username}
              className="group relative flex w-full justify-center rounded-md bg-green-600 py-3 px-4 text-sm font-semibold text-white hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
            <button
              onClick={() => {
                if (!username) return;
                const newRoomId = uuidv4();
                handleJoin(newRoomId);
              }}
              disabled={!username}
              className="group relative flex w-full justify-center rounded-md bg-gray-700 py-3 px-4 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create New
            </button>
          </div>
          
          {/* Saved Rooms List */}
          {savedRooms.length > 0 && (
              <div className="mt-8 border-t border-gray-800 pt-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Recent Rooms
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                      {savedRooms.map(room => (
                          <div 
                              key={room.id}
                              onClick={() => {
                                  if (username) handleJoin(room.id);
                              }}
                              className={`flex items-center justify-between p-3 rounded bg-gray-900 border border-gray-800 hover:border-green-500 cursor-pointer transition-colors ${!username ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                              <div className="flex flex-col">
                                  <span className="text-sm font-mono text-gray-300 truncate max-w-[200px]">{room.id}</span>
                                  <span className="text-xs text-gray-600">{new Date(room.lastActive).toLocaleDateString()}</span>
                              </div>
                              <button 
                                  onClick={(e) => deleteRoom(room.id, e)}
                                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-gray-800 rounded-full"
                              >
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                      ))}
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatEntry />
    </Suspense>
  );
}
