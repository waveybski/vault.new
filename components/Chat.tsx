
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSocket } from "@/hooks/useSocket";
import { usePeer } from "@/hooks/usePeer";
import {
  generateKeyPair,
  generateSymKey,
  exportKey,
  importKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  encryptKey,
  decryptKey,
} from "@/lib/encryption";
import { Send, Phone, Video, X, Lock, ShieldAlert, FileUp, Link as LinkIcon, Download, Timer, Bomb, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface MessageContent {
  type: "text" | "file";
  text?: string;
  data?: string;
  name?: string;
  mime?: string;
  expiresAt?: number;
}

interface Message {
  id: string;
  senderId: string;
  content: MessageContent;
  timestamp: number;
  type: "user" | "system";
}

interface ChatProps {
  roomId: string;
  userId: string;
  username: string;
  saveMessages: boolean;
  onLeave: () => void;
}

export default function Chat({ roomId, userId, username, saveMessages, onLeave }: ChatProps) {
  const socket = useSocket();
  const peer = usePeer(userId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [identityKey, setIdentityKey] = useState<CryptoKeyPair | null>(null);
  const [roomKey, setRoomKey] = useState<CryptoKey | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [expirationTime, setExpirationTime] = useState<number>(0); // 0 = off, otherwise ms
  
  // Load saved messages on mount
  useEffect(() => {
      const saved = localStorage.getItem(`vault_msgs_${roomId}`);
      if (saved) {
          try {
              setMessages(JSON.parse(saved));
          } catch (e) {
              console.error("Failed to load messages", e);
          }
      }
  }, [roomId]);

  // Save messages to local storage
  useEffect(() => {
      if (saveMessages && messages.length > 0) {
          // Filter out system messages and expired messages before saving? 
          // User probably wants to keep chat history as is.
          localStorage.setItem(`vault_msgs_${roomId}`, JSON.stringify(messages));
      }
  }, [messages, roomId, saveMessages]);

  // Message Cleanup Effect
  useEffect(() => {
    const interval = setInterval(() => {
        setMessages(prev => prev.filter(msg => {
            if (msg.type === "system") return true;
            if (!msg.content.expiresAt) return true;
            return msg.content.expiresAt > Date.now();
        }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Video Call State
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [inCall, setInCall] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Prevent screenshot (best effort)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.style.filter = "blur(20px)";
      } else {
        document.body.style.filter = "none";
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", () => {
        document.body.style.filter = "blur(20px)";
    });
    window.addEventListener("focus", () => {
        document.body.style.filter = "none";
    });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", () => {});
      window.removeEventListener("focus", () => {});
    };
  }, []);

  // Initialize Keys and Socket
  useEffect(() => {
    const init = async () => {
      const keyPair = await generateKeyPair();
      setIdentityKey(keyPair);
    };
    init();
  }, []);

  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (!socket || !identityKey || hasJoined) return;

    // Join Room
    socket.emit("join-room", roomId, userId, username, async (response: { size: number; isCreator: boolean; users: {userId: string, username: string}[] }) => {
      setHasJoined(true);
      if (response.isCreator) {
        const key = await generateSymKey();
        setRoomKey(key);
        setIsEncrypted(true);
        addSystemMessage("You created the secure room. Waiting for others...");
      } else {
        addSystemMessage("Joined room. Waiting for secure key exchange...");
      }
      
      // Update users list and map
      const userList = response.users || [];
      setUsers(userList.map(u => u.userId));
      const newMap = new Map();
      userList.forEach(u => newMap.set(u.userId, u.username));
      setUserMap(newMap);

      const exportedPub = await exportKey(identityKey.publicKey);
      socket.emit("public-key", { roomId, userId, publicKey: exportedPub });
    });

    socket.on("user-connected", (data: {userId: string, username: string}) => {
      // Prevent duplicate join messages
      setUsers((prev) => {
        if (prev.includes(data.userId)) return prev;
        addSystemMessage(`${data.username || data.userId.slice(0, 4)} joined.`);
        return [...prev, data.userId];
      });
      setUserMap(prev => new Map(prev).set(data.userId, data.username));
    });

    socket.on("user-disconnected", (leftUserId) => {
      const name = userMap.get(leftUserId) || leftUserId.slice(0, 4);
      setUsers((prev) => prev.filter((id) => id !== leftUserId));
      setUserMap(prev => {
          const newMap = new Map(prev);
          newMap.delete(leftUserId);
          return newMap;
      });
      addSystemMessage(`${name} left.`);
    });
    
    socket.on("nuke-room", () => {
        setMessages([]);
        addSystemMessage("☢️ ROOM NUKED - EVACUATING... ☢️");
        setTimeout(() => onLeave(), 2000);
    });

    socket.on("receive-message", async (data: { message: { iv: number[]; data: number[] }; senderId: string }) => {
      if (!roomKey) return;
      try {
        const decryptedJson = await decryptMessage(data.message, roomKey);
        const content = JSON.parse(decryptedJson);
        
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36),
            senderId: data.senderId,
            content,
            timestamp: Date.now(),
            type: "user",
          },
        ]);
      } catch (e) {
        console.error("Failed to decrypt message", e);
      }
    });

    return () => {
      socket.off("user-connected");
      socket.off("user-disconnected");
      socket.off("receive-message");
    };
  }, [socket, identityKey, roomId, userId, roomKey]);

  // Key Exchange Logic
  useEffect(() => {
      if (!socket || !roomKey || !identityKey) return;
      
      const handlePublicKey = async (data: { userId: string; publicKey: JsonWebKey }) => {
        if (data.userId === userId) return;
        try {
            const theirPubKey = await importKey(data.publicKey, "ECDH");
            const sharedSecret = await deriveSharedKey(identityKey.privateKey, theirPubKey);
            const encryptedRoomKey = await encryptKey(roomKey, sharedSecret);
            const myPub = await exportKey(identityKey.publicKey);

            socket.emit("encrypted-room-key-v2", {
                roomId,
                targetUserId: data.userId,
                senderId: userId,
                senderPublicKey: myPub,
                encryptedKey: encryptedRoomKey
            });
        } catch (e) {
            console.error("Key exchange failed", e);
        }
      };

      socket.on("public-key", handlePublicKey);
      return () => { socket.off("public-key", handlePublicKey); };
  }, [socket, roomKey, identityKey, roomId, userId]);

  useEffect(() => {
    if (!socket || !identityKey) return;
    
    const handleEncryptedRoomKey = async (data: { targetUserId: string; senderId: string; senderPublicKey: JsonWebKey; encryptedKey: any }) => {
        if (data.targetUserId !== userId) return;
        if (roomKey) return;

        try {
            const senderPub = await importKey(data.senderPublicKey, "ECDH");
            const sharedSecret = await deriveSharedKey(identityKey.privateKey, senderPub);
            const key = await decryptKey(data.encryptedKey, sharedSecret);
            setRoomKey(key);
            setIsEncrypted(true);
            addSystemMessage("Secure connection established. Room Key received.");
        } catch (e) {
            console.error("Failed to decrypt room key", e);
            addSystemMessage("Failed to establish secure connection.");
        }
    };

    socket.on("encrypted-room-key-v2", handleEncryptedRoomKey);
    return () => { socket.off("encrypted-room-key-v2"); };
  }, [socket, identityKey, roomKey, userId]);

  // PeerJS Call Handling
  useEffect(() => {
    if (!peer) return;

    peer.on("call", (call) => {
        setInCall(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            call.answer(stream);
            call.on("stream", (remote) => {
                setRemoteStream(remote);
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
            });
            call.on("close", () => {
                setInCall(false);
                setRemoteStream(null);
            });
        });
    });
  }, [peer]);

  const startCall = (targetUserId: string) => {
    if (!peer) return;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const call = peer.call(targetUserId, stream);
        setInCall(true);
        call.on("stream", (remote) => {
            setRemoteStream(remote);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
        });
        call.on("close", () => {
            setInCall(false);
            setRemoteStream(null);
        });
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || !roomKey || !socket) return;
    
    const content: MessageContent = { 
        type: "text", 
        text: input,
        expiresAt: expirationTime > 0 ? Date.now() + expirationTime : undefined
    };
    const payload = JSON.stringify(content);
    const encrypted = await encryptMessage(payload, roomKey);
    
    socket.emit("send-message", {
        roomId,
        message: encrypted,
        senderId: userId
    });
    
    setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderId: userId,
        content,
        timestamp: Date.now(),
        type: "user"
    }]);
    setInput("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomKey || !socket) return;

    if (file.size > 5 * 1024 * 1024) {
        addSystemMessage("File too large (max 5MB).");
        return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result as string;
        const content: MessageContent = {
            type: "file",
            name: file.name,
            mime: file.type,
            data: base64,
            expiresAt: expirationTime > 0 ? Date.now() + expirationTime : undefined
        };
        const payload = JSON.stringify(content);
        const encrypted = await encryptMessage(payload, roomKey);

        socket.emit("send-message", {
            roomId,
            message: encrypted,
            senderId: userId
        });

        setMessages(prev => [...prev, {
            id: Math.random().toString(),
            senderId: userId,
            content,
            timestamp: Date.now(),
            type: "user"
        }]);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addSystemMessage = (text: string) => {
    setMessages(prev => {
        // Prevent duplicate system messages within 1 second
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.type === "system" && lastMsg.content.text === text && Date.now() - lastMsg.timestamp < 1000) {
            return prev;
        }
        return [...prev, {
            id: Math.random().toString(),
            senderId: "system",
            content: { type: "text", text },
            timestamp: Date.now(),
            type: "system"
        }];
    });
  };

  const copyInvite = () => {
      const url = `${window.location.origin}?room=${roomId}`;
      navigator.clipboard.writeText(url);
      addSystemMessage("Invite link copied to clipboard!");
  };

  const [confirmation, setConfirmation] = useState<{ type: "nuke" | "web-nuke", isOpen: boolean }>({ type: "nuke", isOpen: false });
  const [confirmInput, setConfirmInput] = useState("");

  const handleConfirm = () => {
    if (confirmation.type === "nuke" && confirmInput === "DELETE") {
        socket?.emit("nuke-room", roomId);
        
        // Remove saved messages for this room
        localStorage.removeItem(`vault_msgs_${roomId}`);

        setConfirmation({ ...confirmation, isOpen: false });
    } else if (confirmation.type === "web-nuke" && confirmInput === "CONFIRM") {
        socket?.emit("web-nuke");
        setConfirmation({ ...confirmation, isOpen: false });
    } else {
        alert("Incorrect confirmation code.");
    }
    setConfirmInput("");
  };

  const nukeRoom = () => {
      setConfirmation({ type: "nuke", isOpen: true });
  };

  const webNuke = () => {
      setConfirmation({ type: "web-nuke", isOpen: true });
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-2 max-w-[40%]">
            {isEncrypted ? <Lock className="text-green-500 w-5 h-5 shrink-0" /> : <ShieldAlert className="text-yellow-500 w-5 h-5 shrink-0" />}
            <span className="font-mono text-sm text-gray-400 truncate hidden sm:block">Room: {roomId}</span>
            <span className="font-mono text-sm text-gray-400 truncate sm:hidden">...{roomId.slice(-4)}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={webNuke} className="p-2 hover:bg-red-950 rounded-full text-red-600 font-bold border border-red-900 hidden sm:block" title="WEB NUKE (Admin Only)">
                <Bomb className="w-5 h-5" />
            </button>
            <button onClick={nukeRoom} className="p-2 hover:bg-red-900 rounded-full" title="Nuke Room Data">
                <Trash2 className="w-5 h-5 text-red-500" />
            </button>
            <button onClick={copyInvite} className="p-2 hover:bg-gray-800 rounded-full" title="Copy Invite Link">
                 <LinkIcon className="w-5 h-5 text-blue-500" />
            </button>
            <div className="text-xs text-gray-500 hidden sm:block">{users.length} users</div>
            <div className="text-xs text-gray-500 sm:hidden">{users.length}</div>
            <button onClick={onLeave} className="p-2 hover:bg-red-900 rounded-full"><X className="w-5 h-5 text-red-500" /></button>
        </div>
      </div>

      {/* Call UI */}
      {inCall && (
        <div className="h-64 bg-gray-900 flex items-center justify-center border-b border-gray-800 relative">
            <video ref={localVideoRef} autoPlay muted className="absolute bottom-2 right-2 w-32 h-24 bg-black border border-gray-700 rounded object-cover z-10" />
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-contain" />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
            <div key={msg.id} className={clsx("flex flex-col", msg.senderId === userId ? "items-end" : "items-start")}>
                {msg.type === "system" ? (
                    <div className="text-xs text-gray-600 text-center w-full my-2 font-mono">{msg.content.text}</div>
                ) : (
                    <>
                    {msg.senderId !== userId && (
                        <span className="text-xs text-gray-500 ml-1 mb-1">
                            {userMap.get(msg.senderId) || "Unknown"}
                        </span>
                    )}
                    <div className={clsx(
                        "max-w-[80%] rounded-lg px-4 py-2 break-words",
                        msg.senderId === userId ? "bg-green-700 text-white" : "bg-gray-800 text-gray-200"
                    )}>
                        {msg.content.type === "text" && <span>{msg.content.text}</span>}
                        {msg.content.type === "file" && (
                            <div className="flex flex-col items-center gap-2">
                                {msg.content.mime?.startsWith("image/") ? (
                                    <img src={msg.content.data} alt={msg.content.name} className="max-w-full rounded" />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <FileUp className="w-6 h-6" />
                                        <span className="text-sm underline truncate max-w-[150px]">{msg.content.name}</span>
                                    </div>
                                )}
                                <a href={msg.content.data} download={msg.content.name} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white mt-1">
                                    <Download className="w-3 h-3" /> Download
                                </a>
                            </div>
                        )}
                    </div>
                    </>
                )}
            </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2 items-center pb-safe">
        <button 
            onClick={() => {
                const target = users.find(u => u !== userId);
                if (target) startCall(target);
                else addSystemMessage("No users to call.");
            }} 
            className="p-2 text-gray-400 hover:text-white hidden sm:block"
            title="Call (First User)"
        >
            <Video className="w-5 h-5" />
        </button>

        <button
            onClick={() => {
                const times = [0, 10000, 60000, 3600000]; // Off, 10s, 1m, 1h
                const nextIndex = (times.indexOf(expirationTime) + 1) % times.length;
                setExpirationTime(times[nextIndex]);
                const labels = ["Off", "10s", "1m", "1h"];
                addSystemMessage(`Message expiration set to: ${labels[nextIndex]}`);
            }}
            className={clsx("p-2 hover:text-white", expirationTime > 0 ? "text-red-500" : "text-gray-400")}
            title={`Expiration: ${expirationTime === 0 ? "Off" : expirationTime / 1000 + "s"}`}
        >
            <Timer className="w-5 h-5" />
        </button>

        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileSelect} 
        />
        <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-white"
            title="Send File"
        >
            <FileUp className="w-5 h-5" />
        </button>
        
        <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-black border border-gray-700 rounded-full px-4 py-2 focus:outline-none focus:border-green-500 text-sm"
            placeholder={isEncrypted ? "Message..." : "Waiting..."}
            disabled={!isEncrypted}
        />
        <button 
            onClick={sendMessage} 
            disabled={!isEncrypted}
            className="p-2 bg-green-600 rounded-full text-white hover:bg-green-500 disabled:opacity-50"
        >
            <Send className="w-5 h-5" />
        </button>
      </div>
      
      {/* Anti-Screenshot Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 bg-black mix-blend-multiply opacity-0" />

      {/* Confirmation Modal */}
      {confirmation.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-red-900 rounded-lg p-6 max-w-sm w-full space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-red-500">
                    <ShieldAlert className="w-8 h-8" />
                    <h3 className="text-lg font-bold">Security Verification</h3>
                </div>
                <p className="text-gray-300 text-sm">
                    {confirmation.type === "nuke" 
                        ? "Are you sure you want to NUKE this room? This will permanently delete all messages for everyone." 
                        : "WARNING: WEB NUKE. This will wipe ALL rooms, disconnect ALL users, and reset the server."}
                </p>
                <div className="space-y-2">
                    <label className="text-xs text-gray-500 uppercase">
                        Type <span className="font-mono text-white font-bold">{confirmation.type === "nuke" ? "DELETE" : "CONFIRM"}</span> to continue:
                    </label>
                    <input 
                        type="text" 
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-white focus:border-red-500 outline-none font-mono"
                        placeholder={confirmation.type === "nuke" ? "DELETE" : "CONFIRM"}
                    />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                    <button 
                        onClick={() => {
                            setConfirmation({ ...confirmation, isOpen: false });
                            setConfirmInput("");
                        }}
                        className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-red-900 hover:bg-red-800 text-white rounded text-sm font-bold"
                    >
                        {confirmation.type === "nuke" ? "NUKE ROOM" : "EXECUTE"}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
