
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Connect to the same host/port as the page is served from
    const socketIo = io({
      path: "/socket.io",
      addTrailingSlash: false,
    });

    if (!socketIo.connected) {
      socketIo.connect();
    }

    setSocket(socketIo);

    return () => {
      // Don't disconnect here to keep connection alive across navigation
      // socketIo.disconnect();
    };
  }, []); // Run once on mount

  return socket;
};
