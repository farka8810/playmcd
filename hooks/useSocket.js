'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { EVENTS } from '@/lib/events';

// Opens a Socket.IO connection to the same origin (the custom server), joins a
// room, and exposes the live room snapshot + global leaderboard as React state.
export function useSocket({ room, name } = {}) {
  const socketRef = useRef(null);
  const [state, setState] = useState(null); // latest EVENTS.STATE snapshot
  const [leaderboard, setLeaderboard] = useState([]);
  const [connected, setConnected] = useState(false);
  const [meId, setMeId] = useState(null); // this client's socket id

  useEffect(() => {
    if (!room || !name) return undefined;

    // No URL => same origin as the page, which is exactly the custom server.
    const socket = io({ transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setMeId(socket.id);
      socket.emit(EVENTS.JOIN, { room, name });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(EVENTS.STATE, setState);
    socket.on(EVENTS.LEADERBOARD, setLeaderboard);

    return () => {
      socket.emit(EVENTS.LEAVE);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [room, name]);

  const tap = useCallback(() => socketRef.current?.emit(EVENTS.TAP), []);

  return { state, leaderboard, connected, meId, tap };
}
