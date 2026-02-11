
import { useEffect, useState } from "react";
import type Peer from "peerjs";

export const usePeer = (userId: string) => {
  const [peer, setPeer] = useState<Peer | null>(null);

  useEffect(() => {
    if (!userId) return;

    let myPeer: Peer;

    const initPeer = async () => {
      try {
        const { default: Peer } = await import("peerjs");
        myPeer = new Peer(userId);

        myPeer.on("open", (id) => {
          console.log("My peer ID is: " + id);
        });

        setPeer(myPeer);
      } catch (e) {
        console.error("Failed to load peerjs", e);
      }
    };

    initPeer();

    return () => {
      if (myPeer) {
        myPeer.destroy();
      }
    };
  }, [userId]);

  return peer;
};
