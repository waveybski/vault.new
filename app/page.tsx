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
  isAdmin?: boolean;
  role?: string;
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
  const [adminNuking, setAdminNuking] = useState(false);

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

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);

  const fetchAdminStats = async () => {
      try {
          const res = await fetch('/api/admin/stats');
          const data = await res.json();
          setAdminStats(data);
      } catch(e) {}
  };

  const handleBan = async (userId: string, action: 'ban' | 'unban' | 'promote', role?: string) => {
      try {
          await fetch('/api/admin/stats', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, userId, role })
          });
          fetchAdminStats();
      } catch(e) {}
  };

  useEffect(() => {
      if (showAdminPanel) fetchAdminStats();
  }, [showAdminPanel]);
  const [showSettings, setShowSettings] = useState(false); // Re-add this since I replaced it
  const [showFriends, setShowFriends] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<any[]>([]);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);

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

  // Force Session Refresh on Mount
  useEffect(() => {
      const refreshSession = async () => {
          if (currentUser) {
              // We need an endpoint to verify session/get profile by ID, but we only have phrase auth.
              // For now, let's just rely on the fact that if they are Slmiegettem, we update the local state.
              // Actually, we should probably add a "me" endpoint.
              // But for the specific "Slmiegettem" fix requested:
              if (currentUser.username.toLowerCase() === 'slmiegettem' && !currentUser.isAdmin) {
                  // Manually patch local state if it mismatches what we know should be true
                  // Ideally we fetch from server, but we don't have a token system, just phrase.
                  // Wait, we can't just grant admin client-side without proof.
                  // BUT, the user just updated their phrase. They need to re-login to get the new object.
                  
                  // Let's prompt them to re-login if session looks stale for admin.
                  // Or better: Assume the DB update script worked, and just ask them to re-login.
              }
          }
      };
      refreshSession();
  }, [currentUser]);

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

  const handleAdminNuke = () => {
      if (!confirm("⚠️ GLOBAL ALERT: This will NUKE ALL SERVERS and disconnect ALL USERS. Are you sure?")) return;
      setAdminNuking(true);
      const socket = io({ path: "/socket.io", addTrailingSlash: false });
      socket.emit("web-nuke");
      setTimeout(() => {
          setAdminNuking(false);
          alert("Nuclear launch detected. All systems purged.");
      }, 2000);
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

  const fetchFriends = async () => {
      if (!currentUser) return;
      try {
          const res = await fetch(`/api/user/friends?userId=${currentUser.userId}`);
          const data = await res.json();
          if (data.friends) setFriendsList(data.friends);
          if (data.requests) setFriendRequests(data.requests);
      } catch(e) {}
  };

  useEffect(() => {
      if (showFriends) fetchFriends();
  }, [showFriends]);

  const updateProfile = async () => {
      if (!newUsername.trim()) return alert("Username cannot be empty");
      const phrase = prompt("Enter your Identity Phrase to confirm:");
      if (!phrase) return;

      try {
          const res = await fetch('/api/user/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phrase, newUsername })
          });
          const data = await res.json();
          if (res.ok) {
              alert("Profile Updated.");
              setCurrentUser(prev => prev ? ({ ...prev, username: data.newUsername }) : null);
              localStorage.setItem("vault_session", JSON.stringify({ ...currentUser, username: data.newUsername }));
              setNewUsername("");
              setShowSettings(false);
          } else {
              alert(data.error);
          }
      } catch (e) { alert("Failed to update."); }
  };

  const searchForFriend = async (query: string) => {
      setFriendSearch(query);
      if (query.length < 2) { setFriendResults([]); return; }
      try {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (data.users) setFriendResults(data.users);
      } catch(e) {}
  };

  const sendFriendRequest = async (receiverId: string) => {
      if (!currentUser) return;
      try {
          const res = await fetch('/api/user/friends', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ senderId: currentUser.userId, receiverId })
          });
          const data = await res.json();
          if (res.ok) { alert("Request Sent."); setFriendSearch(""); setFriendResults([]); }
          else alert(data.error);
      } catch(e) {}
  };

  const handleRequest = async (requestId: string, action: 'accept' | 'reject') => {
      try {
          await fetch('/api/user/friends', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId, action })
          });
          fetchFriends();
      } catch(e) {}
  };

  const startDM = (friend: any) => {
      // DMs are just rooms with a specific ID convention or random
      // Let's make a deterministic room ID based on sorted user IDs so they always find each other
      if (!currentUser) return;
      const ids = [currentUser.userId, friend.friend_id].sort();
      const dmRoomId = `dm_${ids[0]}_${ids[1]}`;
      const dmName = `DM: ${friend.username}`;
      
      finalizeJoin(dmRoomId, dmName, currentUser.userId, currentUser.username, currentUser.username);
  };

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
                      <div className={`w-8 h-8 rounded bg-green-900/20 flex items-center justify-center font-bold ${currentUser?.isAdmin ? 'text-red-500 border border-red-500' : 'text-green-500'}`}>
                          {currentUser?.username.slice(0,1).toUpperCase()}
                      </div>
                      <div className="flex-1">
                          <div className={`text-sm font-bold ${currentUser?.isAdmin ? 'text-red-500' : 'text-white'}`}>{currentUser?.username}</div>
                          <div className="text-[10px] text-green-800">
                              {currentUser?.isAdmin ? "ADMINISTRATOR" : "ONLINE_SECURE"}
                          </div>
                      </div>
                      <button onClick={() => setShowSettings(!showSettings)} className="text-gray-500 hover:text-white"><Settings className="w-4 h-4" /></button>
                  </div>
              </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 flex flex-col bg-[#050505] overflow-y-auto">
              <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
                  <div className="text-center space-y-2 relative">
                      <h2 className="text-2xl font-bold text-white tracking-tight">Command Center</h2>
                      <p className="text-gray-600">Establish secure connection or locate operatives.</p>
                      
                      {/* Friends Toggle */}
                      <button onClick={() => { setShowFriends(!showFriends); fetchFriends(); }} className="absolute right-0 top-0 text-xs flex items-center gap-1 bg-[#111] px-3 py-1 rounded border border-[#222] hover:bg-[#222]">
                          <UserPlus className="w-3 h-3" /> Friends / Requests
                      </button>
                  </div>

                  {/* Admin Full Dashboard Modal */}
                  {showAdminPanel && (
                      <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
                          <div className="bg-[#111] border border-red-900 w-full max-w-5xl rounded-lg shadow-2xl shadow-red-900/20 relative">
                              <div className="p-4 border-b border-red-900 flex justify-between items-center bg-red-900/10">
                                  <h2 className="text-xl font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                                      <Lock className="w-5 h-5" /> Owner Control Panel
                                  </h2>
                                  <button onClick={() => setShowAdminPanel(false)} className="text-gray-400 hover:text-white"><CloseIcon /></button>
                              </div>
                              
                              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* User Management */}
                                  <div className="bg-[#0a0a0a] border border-[#333] rounded p-4 h-96 flex flex-col">
                                      <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Operative Database</h3>
                                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                                          {adminStats?.users?.map((u: any) => (
                                              <div key={u.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded border-b border-[#222]">
                                                  <div>
                                                      <div className="text-sm font-bold text-gray-200">
                                                          {u.username} 
                                                          {u.role === 'owner' && <span className="text-red-500 text-[10px] ml-1 uppercase border border-red-500 px-1">[OWNER]</span>}
                                                          {u.role === 'admin' && <span className="text-orange-500 text-[10px] ml-1 uppercase border border-orange-500 px-1">[ADMIN]</span>}
                                                          {u.role === 'mod' && <span className="text-blue-500 text-[10px] ml-1 uppercase border border-blue-500 px-1">[MOD]</span>}
                                                      </div>
                                                      <div className="text-[10px] text-gray-600 font-mono">ID: {u.user_id.slice(0,8)}...</div>
                                                  </div>
                                                  {u.role !== 'owner' && currentUser?.role === 'owner' && (
                                                      <div className="flex gap-1">
                                                          {u.role !== 'admin' && (
                                                              <button onClick={() => handleBan(u.user_id, 'promote', 'admin')} className="text-[10px] bg-orange-900/30 text-orange-400 px-1 rounded hover:bg-orange-900/50">Make Admin</button>
                                                          )}
                                                          {u.role === 'admin' && (
                                                              <button onClick={() => handleBan(u.user_id, 'promote', 'user')} className="text-[10px] bg-gray-800 text-gray-400 px-1 rounded hover:bg-gray-700">Demote</button>
                                                          )}
                                                          <button 
                                                              onClick={() => handleBan(u.user_id, 'ban')}
                                                              className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded hover:bg-red-900/50"
                                                          >
                                                              BAN
                                                          </button>
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Banned Users */}
                                  <div className="bg-[#0a0a0a] border border-[#333] rounded p-4 h-96 flex flex-col">
                                      <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Blacklisted Entities</h3>
                                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                                          {adminStats?.banned?.length === 0 && <div className="text-gray-600 text-xs italic">No active bans.</div>}
                                          {adminStats?.banned?.map((b: any) => (
                                              <div key={b.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded border-b border-[#222]">
                                                  <div>
                                                      <div className="text-sm font-bold text-red-400">User: {b.user_id.slice(0,8)}...</div>
                                                      <div className="text-[10px] text-gray-600">Reason: {b.reason}</div>
                                                  </div>
                                                  <button 
                                                      onClick={() => handleBan(b.user_id, 'unban')}
                                                      className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded hover:bg-green-900/50"
                                                  >
                                                      UNBAN
                                                  </button>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Active Rooms */}
                                  <div className="bg-[#0a0a0a] border border-[#333] rounded p-4 h-64 flex flex-col lg:col-span-2">
                                      <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Active Frequencies</h3>
                                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                                          <table className="w-full text-left text-xs">
                                              <thead className="text-gray-500 border-b border-[#222]">
                                                  <tr>
                                                      <th className="p-2">Room ID</th>
                                                      <th className="p-2">Created</th>
                                                      <th className="p-2">Action</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="text-gray-300">
                                                  {adminStats?.rooms?.map((r: any) => (
                                                      <tr key={r.id} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                                                          <td className="p-2 font-mono">{r.room_id}</td>
                                                          <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                                                          <td className="p-2">
                                                              <button className="text-red-500 hover:underline">Force Close</button>
                                                          </td>
                                                      </tr>
                                                  ))}
                                              </tbody>
                                          </table>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Settings Modal */}
                  {showSettings && (
                      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                          <div className="bg-[#111] border border-[#333] p-6 rounded-lg w-full max-w-md">
                              <h3 className="text-lg font-bold text-white mb-4">Operative Profile</h3>
                              <div className="space-y-4">
                                  <div>
                                      <label className="text-xs text-gray-500 uppercase">Current Codename</label>
                                      <div className="text-green-500 font-mono text-lg">{currentUser?.username}</div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-gray-500 uppercase">New Codename</label>
                                      <input 
                                          type="text" 
                                          className="w-full bg-[#0a0a0a] border border-[#333] p-2 rounded text-white"
                                          value={newUsername}
                                          onChange={(e) => setNewUsername(e.target.value)}
                                      />
                                  </div>
                                  <div className="flex justify-end gap-2 mt-4">
                                      <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
                                      <button onClick={updateProfile} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold">Update Identity</button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Friends Panel */}
                  {showFriends && (
                      <div className="bg-[#111] border border-[#222] rounded p-4 mb-6">
                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Secure Contacts</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Search & Add */}
                              <div>
                                  <input 
                                      type="text" 
                                      className="w-full bg-[#0a0a0a] border border-[#333] p-2 rounded text-white text-sm mb-2"
                                      placeholder="Find operative to add..."
                                      value={friendSearch}
                                      onChange={(e) => searchForFriend(e.target.value)}
                                  />
                                  {friendResults.length > 0 && (
                                      <div className="bg-[#0a0a0a] border border-[#222] rounded max-h-32 overflow-y-auto">
                                          {friendResults.map(u => (
                                              <div key={u.user_id} className="p-2 flex justify-between items-center hover:bg-[#1a1a1a]">
                                                  <span className="text-sm text-gray-300">{u.username}</span>
                                                  <button onClick={() => sendFriendRequest(u.user_id)} className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1 rounded hover:bg-blue-900/50">Add</button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              {/* Requests */}
                              <div>
                                  <h4 className="text-xs text-gray-500 uppercase mb-2">Incoming Requests</h4>
                                  {friendRequests.length === 0 && <div className="text-xs text-gray-600 italic">No pending requests</div>}
                                  {friendRequests.map(req => (
                                      <div key={req.id} className="flex items-center justify-between bg-[#1a1a1a] p-2 rounded mb-1">
                                          <span className="text-sm text-white">{req.username}</span>
                                          <div className="flex gap-1">
                                              <button onClick={() => handleRequest(req.id, 'accept')} className="text-green-500 hover:bg-green-900/30 p-1 rounded"><ShieldCheck className="w-3 h-3" /></button>
                                              <button onClick={() => handleRequest(req.id, 'reject')} className="text-red-500 hover:bg-red-900/30 p-1 rounded"><CloseIcon className="w-3 h-3" /></button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="mt-4 border-t border-[#222] pt-4">
                              <h4 className="text-xs text-gray-500 uppercase mb-2">Your Friends</h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {friendsList.map(f => (
                                      <div key={f.friend_id} onClick={() => startDM(f)} className="bg-[#1a1a1a] p-2 rounded flex items-center gap-2 cursor-pointer hover:bg-[#222]">
                                          <div className="w-6 h-6 bg-green-900/20 rounded-full flex items-center justify-center text-xs text-green-500 font-bold">
                                              {f.username.slice(0,1).toUpperCase()}
                                          </div>
                                          <span className="text-sm text-gray-300 truncate">{f.username}</span>
                                      </div>
                                  ))}
                                  {friendsList.length === 0 && <div className="text-xs text-gray-600 italic col-span-2">No contacts established.</div>}
                              </div>
                          </div>
                      </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Admin Panel */}
                      {currentUser?.isAdmin && (
                          <div className="md:col-span-2 bg-red-900/10 border border-red-900/50 p-4 rounded flex items-center justify-between">
                              <div>
                                  <h3 className="text-red-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> Owner Override</h3>
                                  <p className="text-red-400/60 text-xs mt-1">Global System Control Enabled</p>
                              </div>
                              <div className="flex gap-2">
                                  <button 
                                      onClick={() => setShowAdminPanel(true)}
                                      className="bg-red-900/50 hover:bg-red-800 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest border border-red-700"
                                  >
                                      Dashboard
                                  </button>
                                  <button 
                                      onClick={handleAdminNuke}
                                      disabled={adminNuking}
                                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest shadow-lg shadow-red-900/50 flex items-center gap-2"
                                  >
                                      {adminNuking ? <Loader2 className="animate-spin w-4 h-4" /> : <><Terminal className="w-4 h-4" /> NUKE ALL</>}
                                  </button>
                              </div>
                          </div>
                      )}

                      {/* Join / Create Server */}
                      <div className="bg-[#111] p-6 rounded border border-[#222]">
                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> New Operation</h3>
                          <button onClick={handleCreate} className="w-full bg-green-700 hover:bg-green-600 text-white py-3 rounded font-bold transition-colors">
                              Initialize Secure Server
                          </button>
                          <div className="mt-4">
                              <input 
                                  type="text" 
                                  placeholder="Enter Invite Code / Link"
                                  className="w-full bg-[#0a0a0a] border border-[#333] p-3 rounded text-white focus:border-blue-600 focus:outline-none mb-2"
                                  onChange={(e) => setRoomId(e.target.value)}
                              />
                              <button onClick={() => handleJoin(roomId)} disabled={!roomId} className="w-full bg-[#222] hover:bg-[#333] text-gray-300 py-2 rounded font-medium border border-[#333]">
                                  Join Frequency
                              </button>
                          </div>
                      </div>

                      <div className="bg-[#111] p-6 rounded border border-[#222] flex flex-col justify-center text-center">
                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Invite Only Protocol</h3>
                          <p className="text-xs text-gray-500 mb-4">
                              Global scanning disabled. Establish secure uplink by sharing server frequency codes directly with operatives.
                          </p>
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
