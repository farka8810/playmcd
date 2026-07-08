'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { EVENTS } from '@/lib/events';

// Opens a Socket.IO connection to the custom server, keeps the global
// leaderboard in state (live), and exposes submitScore() for the end of a run.
export function useLeaderboard() {
  const socketRef = useRef(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({ transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(EVENTS.LEADERBOARD, setLeaderboard);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const submitScore = useCallback((name, score, wave) => {
    socketRef.current?.emit(EVENTS.SUBMIT, { name, score, wave });
  }, []);

  return { leaderboard, connected, submitScore };
}
