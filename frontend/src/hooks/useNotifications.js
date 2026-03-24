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
      const openUrl = typeof data?.primaryUrl === "string" && data.primaryUrl.length > 0 ? data.primaryUrl : null;
      const n = new Notification(title, {
        body: openUrl ? `${body}\nClick to open in map.` : body,
        icon: "/favicon.ico",
        tag: "osint-digest",
        data: openUrl ? { url: openUrl } : undefined,
      });
      n.onclick = () => {
        window.focus();
        if (openUrl) window.location.href = openUrl;
        n.close();
      };
    };

    socket.on("notifications:merged", onMerged);
    return () => {
      socket.off("notifications:merged", onMerged);
    };
  }, [enabled]);
}
