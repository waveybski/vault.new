
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Chat from "@/components/Chat";
import { Clock, Trash2, Settings, X as CloseIcon } from "lucide-react";
import { io } from "socket.io-client";

interface SavedRoom {
  id: string;
  name?: string; // Optional custom name
  lastActive: number;
}

function ChatEntry() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState(""); // For new room creation
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState(""); // Initialize empty
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>([]);
  const [saveMessages, setSaveMessages] = useState(false);
  const [error, setError] = useState("");

  const searchParams = useSearchParams();

  useEffect(() => {
    setUserId(uuidv4()); // Generate ID on client side only
  }, []);

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

  const checkRoomExists = async (id: string): Promise<boolean> => {
      return new Promise((resolve) => {
          const socket = io({ path: "/socket.io", addTrailingSlash: false });
          socket.emit("check-room", id, (exists: boolean) => {
              socket.disconnect();
              resolve(exists);
          });
          // Fallback timeout
          setTimeout(() => {
              socket.disconnect();
              resolve(false);
          }, 2000);
      });
  };

  const handleJoin = async (id: string = roomId) => {
      if (!id || !username) return;
      setError("");

      const exists = await checkRoomExists(id);
      if (!exists) {
          setError("Room ID not found. Please create a new room.");
          return;
      }
      
      // Always save room ID to history
      const newSaved = savedRooms.filter(r => r.id !== id);
      // Preserve existing name if known, otherwise use ID
      const existing = savedRooms.find(r => r.id === id);
      const name = existing?.name || id;
      
      newSaved.unshift({ id, name, lastActive: Date.now() });
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));
      
      setRoomId(id);
      setRoomName(name); // Pass name to chat
      setJoined(true);
  };

  const handleCreate = () => {
      if (!username) return;
      const newRoomId = uuidv4();
      const name = roomName.trim() || "General"; // Default name if empty
      
      // No need to check existence for new room
      const newSaved = savedRooms.filter(r => r.id !== newRoomId);
      newSaved.unshift({ id: newRoomId, name, lastActive: Date.now() });
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));

      setRoomId(newRoomId);
      // setRoomName is already set by input
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
    return <Chat roomId={roomId} roomName={roomName || roomId} userId={userId} username={username} saveMessages={saveMessages} onLeave={() => setJoined(false)} />;
  }

  return (
    <div className="flex h-screen bg-[#313338] text-white overflow-hidden font-sans">
      {/* Sidebar - Your Chats */}
      <div className="w-[72px] md:w-64 bg-[#2b2d31] flex flex-col flex-shrink-0">
          <div className="h-12 border-b border-[#1f2023] flex items-center justify-center md:justify-start md:px-4 shadow-sm">
             <div className="md:hidden font-bold text-green-500">V</div>
             <div className="hidden md:block font-bold text-base text-gray-200">Vault</div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
             {savedRooms.length > 0 && (
                <div className="hidden md:block text-xs font-bold text-gray-400 uppercase mb-2 mt-2 px-2 tracking-wide">
                    Your Chats
                </div>
             )}
             
             {savedRooms.map(room => (
                 <div 
                    key={room.id}
                    onClick={() => { if (username) handleJoin(room.id); }}
                    className={`group relative flex items-center gap-3 px-2 py-2 rounded-md hover:bg-[#35373c] cursor-pointer transition-all ${!username ? 'opacity-50 pointer-events-none' : ''} ${roomId === room.id ? 'bg-[#35373c] text-white' : 'text-gray-400'}`}
                 >
                    {/* Discord-like pill for active state */}
                    {roomId === room.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></div>}
                    
                    <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] flex items-center justify-center transition-all duration-200 flex-shrink-0 text-green-500 overflow-hidden font-bold">
                        {room.name ? room.name.slice(0, 2).toUpperCase() : "#"}
                    </div>
                    
                    <div className="hidden md:flex flex-1 min-w-0 flex-col">
                        <span className="font-medium truncate text-gray-300 group-hover:text-white">{room.name || room.id}</span>
                    </div>

                    <button 
                        onClick={(e) => deleteRoom(room.id, e)}
                        className="hidden md:block p-1 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                 </div>
             ))}

             {savedRooms.length === 0 && (
                 <div className="text-center mt-4 text-xs text-gray-500 hidden md:block px-2">
                     No saved chats. Join a room to see it here.
                 </div>
             )}
          </div>
          
          {/* Settings / User Area */}
          <div className="bg-[#232428] p-2 md:p-3 flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center font-bold text-xs cursor-pointer hover:opacity-80 transition-opacity">
                    {username ? username.slice(0,2).toUpperCase() : "?"}
               </div>
               <div className="hidden md:block flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{username || "Anonymous"}</div>
                    <div className="text-[10px] text-gray-400">#{userId.slice(0,4)}</div>
               </div>
               <button 
                onClick={toggleSettings}
                className={`p-2 rounded hover:bg-gray-700 ${saveMessages ? 'text-green-500' : 'text-gray-400'}`}
                title={saveMessages ? "Messages Saving ON" : "Messages Saving OFF"}
               >
                   <Settings className="w-4 h-4" />
               </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-[#313338] relative">
          {/* Top Bar */}
          <div className="h-12 border-b border-[#26272d] flex items-center px-4 shadow-sm bg-[#313338]">
               <div className="flex items-center gap-2 text-gray-400">
                   <Clock className="w-5 h-5" />
                   <span className="font-bold text-white">Find or Start a Conversation</span>
               </div>
          </div>
          
          {/* Center Content */}
          <div className="flex-1 flex items-center justify-center p-4 bg-[url('https://core-normal.traeapi.us/api/ide/v1/text_to_image?prompt=dark+cyberpunk+abstract+network+nodes+minimalist+background&image_size=landscape_16_9')] bg-cover bg-center">
               <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
               <div className="w-full max-w-2xl relative z-10">
                    <div className="text-center mb-10">
                        <h1 className="text-5xl font-extrabold text-white mb-4 tracking-tight drop-shadow-lg">Vault</h1>
                        <p className="text-xl text-gray-300 font-light">Secure. Ephemeral. Anonymous.</p>
                    </div>
                    
                    <div className="bg-[#2b2d31]/90 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-gray-700/50">
                        <div className="mb-8">
                            <label className="text-sm font-bold text-gray-300 uppercase mb-2 block tracking-wide">Identity</label>
                            <input
                                type="text"
                                className="w-full bg-[#1e1f22] text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all font-medium text-lg placeholder-gray-600"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter your display name..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Join Column */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="h-px flex-1 bg-gray-700"></div>
                                    <span className="text-gray-400 text-sm font-semibold uppercase">Join Existing</span>
                                    <div className="h-px flex-1 bg-gray-700"></div>
                                </div>
                                <input
                                    type="text"
                                    className="w-full bg-[#1e1f22] text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    placeholder="Paste Room ID / Invite Code"
                                />
                                <button
                                    onClick={() => handleJoin(roomId)}
                                    disabled={!roomId || !username}
                                    className="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white py-3 rounded-lg font-bold transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/20"
                                >
                                    Join Room
                                </button>
                            </div>

                            {/* Create Column */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="h-px flex-1 bg-gray-700"></div>
                                    <span className="text-gray-400 text-sm font-semibold uppercase">Create New</span>
                                    <div className="h-px flex-1 bg-gray-700"></div>
                                </div>
                                <input
                                    type="text"
                                    className="w-full bg-[#1e1f22] text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder-gray-600"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                    placeholder="Room Name (Optional)"
                                />
                                <button
                                    onClick={handleCreate}
                                    disabled={!username}
                                    className="w-full bg-[#248046] hover:bg-[#1a6334] text-white py-3 rounded-lg font-bold transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-green-500/20"
                                >
                                    Create Secure Room
                                </button>
                            </div>
                        </div>
                        
                        {error && (
                            <div className="mt-6 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm text-center font-medium animate-pulse">
                                {error}
                            </div>
                        )}
                    </div>
               </div>
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
