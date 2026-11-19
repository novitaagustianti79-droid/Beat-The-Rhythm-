import React, { useRef, useState } from 'react';
import { Check, Copy, Download, FileCode, Smartphone, WifiOff, X } from 'lucide-react';
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

export const StandaloneHtmlExport: React.FC = () => {
  const { isInstalled } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rawModalHtml, setRawModalHtml] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hide inside installed PWA or native Capacitor APK
  if (isInstalled) {
    return null;
  }

  const fetchStandaloneHtml = async (): Promise<string> => {
    const res = await fetch('/beat-the-rhythm.html', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load standalone HTML');
    return await res.text();
  };

  const handleDownloadHtml = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = await fetchStandaloneHtml();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beat-the-rhythm.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyHtml = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = await fetchStandaloneHtml();
      try {
        await navigator.clipboard.writeText(html);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback modal when clipboard API is restricted inside an iframe
        setRawModalHtml(html);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDownloadHtml()}
          className="py-2.5 px-3 rounded-xl bg-[#101220] border border-white/10 hover:border-[#a855f7]/60 text-[#c8cee8] hover:text-white text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          <FileCode className="w-3.5 h-3.5 text-[#a855f7]" />
          Save .HTML File
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCopyHtml()}
          className="py-2.5 px-3 rounded-xl bg-[#101220] border border-white/10 hover:border-[#ff2a85]/60 text-[#c8cee8] hover:text-white text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#34d399]" />
              Copied HTML!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-[#ff2a85]" />
              Copy Raw HTML
            </>
          )}
        </button>
      </div>

      {rawModalHtml !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Raw Standalone HTML"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#101220] border border-[#ff2a85]/40 p-5 text-left shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold tracking-wider uppercase text-white">
                Standalone HTML (WebToApp Ready)
              </h3>
              <button
                type="button"
                onClick={() => setRawModalHtml(null)}
                aria-label="Close"
                className="p-1 rounded-lg text-[#a2a9c8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              ref={textareaRef}
              readOnly
              value={rawModalHtml}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full h-56 rounded-xl bg-[#07080f] border border-white/15 p-3 font-mono text-[11px] text-[#c8cee8] resize-none focus:outline-none focus:border-[#00f0ff]"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  textareaRef.current?.focus();
                  textareaRef.current?.select();
                  try {
                    document.execCommand('copy');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // Selection remains highlighted for manual long-press Copy
                  }
                }}
                className="py-2.5 rounded-xl bg-[#ff2a85]/20 border border-[#ff2a85]/50 text-xs font-bold tracking-wider uppercase text-white cursor-pointer"
              >
                {copied ? 'Copied!' : 'Select All & Copy'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadHtml()}
                className="py-2.5 rounded-xl bg-[#00f0ff]/15 border border-[#00f0ff]/45 text-xs font-bold tracking-wider uppercase text-[#00f0ff] cursor-pointer"
              >
                Download .HTML
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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
