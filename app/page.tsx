
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Chat from "@/components/Chat";
import { Clock, Trash2, Settings, X as CloseIcon } from "lucide-react";
import { io } from "socket.io-client";

interface SavedRoom {
  id: string;
  lastActive: number;
}

function ChatEntry() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
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
      newSaved.unshift({ id, lastActive: Date.now() });
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));
      
      setRoomId(id);
      setJoined(true);
  };

  const handleCreate = () => {
      if (!username) return;
      const newRoomId = uuidv4();
      
      // No need to check existence for new room
      const newSaved = savedRooms.filter(r => r.id !== newRoomId);
      newSaved.unshift({ id: newRoomId, lastActive: Date.now() });
      setSavedRooms(newSaved);
      localStorage.setItem("vault_rooms", JSON.stringify(newSaved));

      setRoomId(newRoomId);
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
                    
                    <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] flex items-center justify-center transition-all duration-200 flex-shrink-0 text-green-500 overflow-hidden">
                        #
                    </div>
                    
                    <div className="hidden md:flex flex-1 min-w-0 flex-col">
                        <span className="font-medium truncate text-gray-300 group-hover:text-white">{room.id}</span>
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
          <div className="flex-1 flex items-center justify-center p-4">
               <div className="w-full max-w-lg text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="w-24 h-24 bg-[#2b2d31] rounded-3xl flex items-center justify-center shadow-xl">
                            <span className="text-4xl">🔐</span>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Welcome to Vault</h2>
                    <p className="text-gray-400 mb-8">Secure, ephemeral, anonymous chat. No logs, no traces.</p>
                    
                    <div className="space-y-4 text-left bg-[#2b2d31] p-6 rounded-lg shadow-lg">
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase mb-1.5 block">Display Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                className="w-full bg-[#1e1f22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="How should we call you?"
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase mb-1.5 block">Room ID</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 bg-[#1e1f22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    placeholder="Enter an ID to join..."
                                />
                                <button
                                    onClick={() => handleJoin(roomId)}
                                    disabled={!roomId || !username}
                                    className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-6 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Join
                                </button>
                            </div>
                        </div>
                        
                        {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
                        
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"></div></div>
                            <div className="relative flex justify-center"><span className="bg-[#2b2d31] px-2 text-xs text-gray-500 uppercase">Or</span></div>
                        </div>
                        
                        <button
                            onClick={handleCreate}
                            disabled={!username}
                            className="w-full bg-[#248046] hover:bg-[#1a6334] text-white p-2.5 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Create New Secure Room
                        </button>
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
