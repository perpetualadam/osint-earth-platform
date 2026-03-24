import { useEffect, useRef } from "react";
import { socket } from "../services/socket";

export function useNotifications(enabled = true) {
  const permissionRef = useRef(null);

  useEffect(() => {
    if (!enabled || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    } else {
      permissionRef.current = Notification.permission;
    }

    const onMerged = (data) => {
      if (Notification.permission !== "granted") return;
      const title = data?.title ?? "OSINT Earth: Updates";
      const body = data?.body ?? "New events and anomalies detected";
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
    };

    socket.on("notifications:merged", onMerged);
    return () => {
      socket.off("notifications:merged", onMerged);
    };
  }, [enabled]);
}
