import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="w-full py-2.5 px-4 rounded-xl bg-[#00f0ff]/12 border border-[#00f0ff]/45 hover:bg-[#00f0ff]/20 text-[#00f0ff] text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4" />
        Install App on Device
      </button>
    );
  }

  if (isIOS || isAndroid) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/35 hover:border-[#00f0ff]/65 text-[#00f0ff] text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          Install on Phone (No PC Needed)
        </button>

        {showGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Install on Phone"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#101220] border border-[#00f0ff]/35 p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-base font-bold tracking-wider uppercase text-white">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install on Android Phone'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close"
                  className="p-1 rounded-lg text-[#a2a9c8] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {isIOS ? (
                <ol className="space-y-2 text-xs sm:text-sm text-[#c8cee8] list-decimal list-inside">
                  <li>Open this page directly in Safari (not inside an in-app preview).</li>
                  <li>
                    Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong className="text-[#00f0ff]">Add to Home Screen</strong>.
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2 text-xs sm:text-sm text-[#c8cee8] list-decimal list-inside">
                  <li>Open the app URL directly in Google Chrome on your phone.</li>
                  <li>
                    Tap the <strong className="text-white">⋮ menu</strong> at the top-right corner of Chrome.
                  </li>
                  <li>
                    Tap <strong className="text-[#00f0ff]">Install app</strong> or{' '}
                    <strong className="text-[#00f0ff]">Add to Home screen</strong> to play fullscreen offline.
                  </li>
                </ol>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#171a2d] border border-white/15 py-2.5 text-xs font-bold tracking-wider uppercase text-white hover:border-[#00f0ff]/50 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-lg bg-[#171a2d]/95 border border-amber-400/50 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-lg backdrop-blur-sm">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      Offline Mode — Cached &amp; Playable
    </div>
  );
};
