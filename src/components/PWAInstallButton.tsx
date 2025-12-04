import React from "react";

export function PWAInstallButton() {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setAvailable(true);
    window.addEventListener("pwa-beforeinstallprompt", handler);
    return () => window.removeEventListener("pwa-beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    const res = await promptEvent.userChoice;
    setAvailable(false);
    if (res?.outcome === "accepted") {
      console.log("PWA install accepted");
    }
  };

  if (!available) return null;
  return (
    <button
      className="btn-secondary"
      onClick={handleInstall}
      title="Install app"
    >
      ⬇ Install
    </button>
  );
}

export default PWAInstallButton;
