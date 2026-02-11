"use client";

import { useEffect, useState } from "react";

interface RoomLog {
  id: number;
  room_id: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [rooms, setRooms] = useState<RoomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/rooms")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch logs");
        return res.json();
      })
      .then((data) => {
        setRooms(data.rooms || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-green-500">Vault // Admin Log</h1>
          <p className="text-gray-500 text-sm mt-1">Neon DB Integration Status: Connected</p>
        </header>

        {loading && <div className="text-yellow-500">Loading logs...</div>}
        {error && <div className="text-red-500">Error: {error}</div>}

        {!loading && !error && (
          <div className="bg-gray-900 rounded border border-gray-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-950 text-gray-400">
                <tr>
                  <th className="p-4 border-b border-gray-800">ID</th>
                  <th className="p-4 border-b border-gray-800">Room UUID</th>
                  <th className="p-4 border-b border-gray-800">Created At (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rooms.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-600">
                      No rooms recorded yet.
                    </td>
                  </tr>
                ) : (
                  rooms.map((room) => (
                    <tr key={room.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="p-4 text-gray-500">#{room.id}</td>
                      <td className="p-4 text-green-400 font-bold">{room.room_id}</td>
                      <td className="p-4 text-gray-300">
                        {new Date(room.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
