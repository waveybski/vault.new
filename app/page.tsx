"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Chat from "@/components/Chat";
import { Clock, Settings, X as CloseIcon, Loader2, ShieldCheck, UserPlus, Search, Terminal, Lock } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface SavedRoom {
  id: string;
  name?: string; 
  lastActive: number;
  userId?: string; 
  username?: string; 
  displayName?: string; 
}

interface User {
  userId: string;
  username: string;
}

function ChatEntry() {
  const [view, setView] = useState<'auth' | 'dashboard' | 'chat'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Auth State
  const [passphrase, setPassphrase] = useState("");
  const [username, setUsername] = useState(""); // Desired username for register
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Dashboard State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Chat State
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState(""); 
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>([]);
  const [saveMessages, setSaveMessages] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  
  // Connection
  const socketRef = useRef<Socket | null>(null);
  const searchParams = useSearchParams();

  // Load Session
  useEffect(() => {
    const savedSession = localStorage.getItem("vault_session");
    if (savedSession) {
        try {
            const user = JSON.parse(savedSession);
            if (user && user.userId && user.username) {
                setCurrentUser(user);
                setView('dashboard');
                // Load user-specific rooms
                const saved = localStorage.getItem(`vault_rooms_${user.userId}`);
                if (saved) {
                    try { setSavedRooms(JSON.parse(saved)); } catch (e) {}
                }
            }
        } catch(e) {}
    }
  }, []);

  // When user changes (login), load their rooms
  useEffect(() => {
      if (currentUser) {
          const saved = localStorage.getItem(`vault_rooms_${currentUser.userId}`);
          if (saved) {
              try { setSavedRooms(JSON.parse(saved)); } catch (e) {}
          } else {
              setSavedRooms([]);
          }
      }
  }, [currentUser]);

  // Handle Login
  const handleLogin = async () => {
      if (!passphrase.trim()) {
          setAuthError("Identity Phrase Required");
          return;
      }
      setIsAuthenticating(true);
      setAuthError("");

      try {
          const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phrase: passphrase })
          });
          const data = await res.json();
          
          if (res.ok && data.found) {
              const user = data.user;
              setCurrentUser(user);
              localStorage.setItem("vault_session", JSON.stringify(user));
              setView('dashboard');
              setPassphrase(""); // Clear secret
          } else {
              // Phrase not found, switch to register
              setAuthMode('register');
              setAuthError("Identity Not Recognized. Initialize New Protocol?");
          }
      } catch (err) {
          setAuthError("Connection Failed. Retrying...");
      } finally {
          setIsAuthenticating(false);
      }
  };

  // Handle Register
  const handleRegister = async () => {
      if (!username.trim()) {
          setAuthError("Codename Required");
          return;
      }
      setIsAuthenticating(true);
      setAuthError("");

      try {
          const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phrase: passphrase, username })
          });
          const data = await res.json();
          
          if (res.ok && data.success) {
              const user = data.user;
              setCurrentUser(user);
              localStorage.setItem("vault_session", JSON.stringify(user));
              setView('dashboard');
              setPassphrase(""); 
          } else {
              setAuthError(data.error || "Registration Failed");
          }
      } catch (err) {
          setAuthError("Registration Error");
      } finally {
          setIsAuthenticating(false);
      }
  };

  // Search Users
  const handleSearch = async (query: string) => {
      setSearchQuery(query);
      if (query.length < 2) {
          setSearchResults([]);
          return;
      }
      setIsSearching(true);
      try {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (data.users) setSearchResults(data.users);
      } catch(e) {} finally {
          setIsSearching(false);
      }
  };

  // Join Logic (Adapted from previous)
  const handleJoin = async (id: string) => {
      const trimmedId = id?.trim();
      if (!trimmedId || !currentUser) return; 
      setError("");

      if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
      }

      const existingRoom = savedRooms.find(r => r.id === trimmedId);
      // Use DB User ID
      const effectiveUserId = currentUser.userId;
      const effectiveUsername = currentUser.username;
      
      const socket = io({ path: "/socket.io", addTrailingSlash: false });
      socketRef.current = socket;

      socket.on("connect", () => {
          socket.emit("join-room", trimmedId, effectiveUserId, effectiveUsername, effectiveUsername, (response: any) => {
               if (response) {
                   const resolvedName = existingRoom?.name || trimmedId;
                   finalizeJoin(trimmedId, resolvedName, effectiveUserId, effectiveUsername, effectiveUsername, response.virtualIP);
               }
          });
      });

      socket.on("waiting-approval", () => setIsWaiting(true));
      socket.on("join-approved", (data: any) => {
          setIsWaiting(false);
          const resolvedName = existingRoom?.name || trimmedId;
          finalizeJoin(trimmedId, resolvedName, effectiveUserId, effectiveUsername, effectiveUsername, data?.virtualIP);
      });
      socket.on("join-rejected", () => {
          setIsWaiting(false);
          setError("Access Denied.");
          socket.disconnect();
      });
  };

  const finalizeJoin = (id: string, name: string, uid: string, uname: string, dname: string, vIP?: string) => {
      if (!currentUser) return;
      const newSaved = savedRooms.filter(r => r.id !== id);
      newSaved.unshift({ 
          id, 
          name, 
          lastActive: Date.now(),
          userId: uid, 
          username: uname,
          displayName: dname
      });
      setSavedRooms(newSaved);
      localStorage.setItem(`vault_rooms_${currentUser.userId}`, JSON.stringify(newSaved));
      
      setRoomId(id);
      setRoomName(name);
      
      if (socketRef.current) socketRef.current.disconnect();
      setJoined(true);
      setView('chat');
  };

  const removeRoom = (id: string) => {
      if (!currentUser) return;
      const newSaved = savedRooms.filter(r => r.id !== id);
      setSavedRooms(newSaved);
      localStorage.setItem(`vault_rooms_${currentUser.userId}`, JSON.stringify(newSaved));
      localStorage.removeItem(`vault_msgs_${id}`);
  };

  const handleCreate = () => {
     if (!currentUser) return;
     const newId = uuidv4();
     finalizeJoin(newId, newId, currentUser.userId, currentUser.username, currentUser.username);
  };

  const logout = () => {
      localStorage.removeItem("vault_session");
      setCurrentUser(null);
      setView('auth');
      setAuthMode('login');
  };

  if (view === 'chat' && currentUser) {
    return <Chat roomId={roomId} roomName={roomName} userId={currentUser.userId} username={currentUser.username} displayName={currentUser.username} saveMessages={saveMessages} onLeave={() => { setJoined(false); setView('dashboard'); }} onNuke={() => { removeRoom(roomId); setJoined(false); setView('dashboard'); }} />;
  }

  // Auth Screen
  if (view === 'auth') {
      return (
          <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-md space-y-8">
                  <div className="text-center space-y-2">
                      <ShieldCheck className="w-16 h-16 mx-auto animate-pulse text-green-600" />
                      <h1 className="text-3xl font-bold tracking-widest uppercase">Vault Protocol</h1>
                      <p className="text-xs text-green-800">Military Grade Encrypted Communication</p>
                  </div>

                  <div className="bg-gray-900/50 border border-green-900 p-8 rounded-lg shadow-2xl backdrop-blur-sm">
                      {authMode === 'login' ? (
                          <div className="space-y-6">
                              <div>
                                  <label className="block text-xs uppercase tracking-widest mb-2 text-green-700">Identity Phrase</label>
                                  <textarea 
                                      className="w-full bg-black border border-green-800 text-green-400 p-4 rounded focus:outline-none focus:border-green-500 transition-colors text-sm"
                                      rows={3}
                                      placeholder="ENTER SECURE PHRASE..."
                                      value={passphrase}
                                      onChange={(e) => setPassphrase(e.target.value)}
                                  />
                              </div>
                              <button 
                                  onClick={handleLogin}
                                  disabled={isAuthenticating}
                                  className="w-full bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-700 py-3 rounded uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2"
                              >
                                  {isAuthenticating ? <Loader2 className="animate-spin" /> : <><Terminal className="w-4 h-4" /> Authenticate</>}
                              </button>
                          </div>
                      ) : (
                          <div className="space-y-6">
                              <div className="text-center text-xs text-green-600 border-b border-green-900 pb-4">
                                  NEW IDENTITY DETECTED
                              </div>
                              <div>
                                  <label className="block text-xs uppercase tracking-widest mb-2 text-green-700">Assign Codename</label>
                                  <input 
                                      type="text"
                                      className="w-full bg-black border border-green-800 text-green-400 p-4 rounded focus:outline-none focus:border-green-500 transition-colors text-lg font-bold"
                                      placeholder="USERNAME"
                                      value={username}
                                      onChange={(e) => setUsername(e.target.value)}
                                  />
                              </div>
                              <button 
                                  onClick={handleRegister}
                                  disabled={isAuthenticating}
                                  className="w-full bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-700 py-3 rounded uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2"
                              >
                                  {isAuthenticating ? <Loader2 className="animate-spin" /> : <><Lock className="w-4 h-4" /> Initialize Account</>}
                              </button>
                              <button onClick={() => setAuthMode('login')} className="w-full text-xs text-green-800 hover:text-green-600 uppercase">Cancel</button>
                          </div>
                      )}

                      {authError && (
                          <div className="mt-4 p-3 bg-red-900/20 border border-red-900 text-red-500 text-xs text-center font-bold">
                              ⚠ {authError}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // Dashboard
  return (
      <div className="flex h-screen bg-[#0a0a0a] text-gray-300 font-sans overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-[#111] border-r border-[#222] flex flex-col">
              <div className="p-4 border-b border-[#222] flex items-center justify-between">
                  <div className="font-bold text-green-600 tracking-wider">VAULT</div>
                  <button onClick={logout} className="text-xs text-gray-600 hover:text-red-500">EXIT</button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2">
                  <div className="text-xs font-bold text-gray-600 uppercase px-2 mb-2 mt-2">Servers You Are In</div>
                  {savedRooms.map(room => (
                      <div key={room.id} onClick={() => handleJoin(room.id)} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#1a1a1a] cursor-pointer group">
                          <div className="w-8 h-8 rounded bg-[#222] flex items-center justify-center text-green-700 font-bold group-hover:text-green-500">
                              {room.name?.slice(0,1).toUpperCase() || "#"}
                          </div>
                          <div className="flex-1 truncate text-sm font-medium">{room.name || "Unknown Server"}</div>
                          <button onClick={(e) => { e.stopPropagation(); removeRoom(room.id); }} className="text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3" /></button>
                      </div>
                  ))}
                  {savedRooms.length === 0 && <div className="px-4 text-xs text-gray-700">No Active Uplinks</div>}
              </div>

              <div className="p-4 border-t border-[#222]">
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-green-900/20 flex items-center justify-center text-green-500 font-bold">
                          {currentUser?.username.slice(0,1).toUpperCase()}
                      </div>
                      <div className="flex-1">
                          <div className="text-sm font-bold text-white">{currentUser?.username}</div>
                          <div className="text-[10px] text-green-800">ONLINE_SECURE</div>
                      </div>
                  </div>
              </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 flex flex-col bg-[#050505]">
              <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
                  <div className="text-center space-y-2">
                      <h2 className="text-2xl font-bold text-white tracking-tight">Command Center</h2>
                      <p className="text-gray-600">Establish secure connection or locate operatives.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Search Users */}
                      <div className="bg-[#111] p-6 rounded border border-[#222]">
                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><Search className="w-4 h-4" /> Global User Search</h3>
                          <div className="relative">
                              <input 
                                  type="text" 
                                  className="w-full bg-[#0a0a0a] border border-[#333] p-3 rounded text-white focus:border-green-600 focus:outline-none"
                                  placeholder="Search codename..."
                                  value={searchQuery}
                                  onChange={(e) => handleSearch(e.target.value)}
                              />
                              {isSearching && <div className="absolute right-3 top-3"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>}
                          </div>
                          {searchResults.length > 0 && (
                              <div className="mt-2 space-y-1 bg-[#0a0a0a] border border-[#222] rounded max-h-40 overflow-y-auto">
                                  {searchResults.map(u => (
                                      <div key={u.user_id} className="p-2 hover:bg-[#1a1a1a] flex items-center justify-between cursor-pointer" onClick={() => {
                                          // Start chat logic? For now just create a room with their name
                                          // Or copy their name
                                          setRoomName(`Chat with ${u.username}`);
                                          handleCreate(); // This creates a NEW room, not a direct DM. 
                                          // Direct DM requires knowing their ID and inviting them.
                                          // For now, let's just copy their name to clipboard or something.
                                      }}>
                                          <span className="text-sm font-medium text-green-500">{u.username}</span>
                                          <UserPlus className="w-3 h-3 text-gray-600" />
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* Create Server */}
                      <div className="bg-[#111] p-6 rounded border border-[#222]">
                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> New Operation</h3>
                          <button onClick={handleCreate} className="w-full bg-green-700 hover:bg-green-600 text-white py-3 rounded font-bold transition-colors">
                              Initialize Secure Server
                          </button>
                          <div className="mt-4">
                              <input 
                                  type="text" 
                                  placeholder="Enter Existing Server ID"
                                  className="w-full bg-[#0a0a0a] border border-[#333] p-3 rounded text-white focus:border-blue-600 focus:outline-none mb-2"
                                  onChange={(e) => setRoomId(e.target.value)}
                              />
                              <button onClick={() => handleJoin(roomId)} disabled={!roomId} className="w-full bg-[#222] hover:bg-[#333] text-gray-300 py-2 rounded font-medium border border-[#333]">
                                  Join Frequency
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="bg-black h-screen flex items-center justify-center text-green-900">INITIALIZING...</div>}>
      <ChatEntry />
    </Suspense>
  );
}
