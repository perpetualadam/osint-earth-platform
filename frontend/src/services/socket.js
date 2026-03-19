import { io } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export const socket = io(WS_URL, {
  transports: ["websocket", "polling"],
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
});

socket.on("connect", () => console.log("WS connected:", socket.id));
socket.on("disconnect", () => console.log("WS disconnected"));
