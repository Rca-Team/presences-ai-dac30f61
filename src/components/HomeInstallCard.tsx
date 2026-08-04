import React, { useState } from 'react';
import { Download, Feather, Share, Plus, Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

/**
 * HomeInstallCard
 * ---------------
 * One-click app download straight from the home page, with a choice between the
 * full experience and the low-graphics Lite app. The Lite choice simply pins the
 * performance preference before the browser install prompt is shown, so the
 * installed app opens in Lite mode.
 */
const HomeInstallCard: React.FC = () => {
  const { install, isInstalled, isIOS, isInstallable } = usePWAInstall();
  const { setPreference } = usePerformanceMode();
  const [done, setDone] = useState<'full' | 'lite' | null>(null);
  const [showIOS, setShowIOS] = useState(false);

  const handle = async (mode: 'full' | 'lite') => {
    setPreference(mode === 'lite' ? 'on' : 'off');
    if (isIOS || !isInstallable) {
      setShowIOS(true);
      return;
    }
    const ok = await install();
    if (ok) setDone(mode);
  };

  if (isInstalled) return null;

  return (
    <section className="pb-14">
      <div className="liquid-glass-surface rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                Download the app
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Install Presences on this device in one click. Choose the full app, or the
                Lite app built for slow networks and low-end phones and smart boards.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row md:flex-shrink-0">
            <Button onClick={() => void handle('full')} className="gap-2">
              {done === 'full' ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {done === 'full' ? 'Installed' : 'Install full app'}
            </Button>
            <Button variant="outline" onClick={() => void handle('lite')} className="gap-2">
              {done === 'lite' ? <Check className="h-4 w-4" /> : <Feather className="h-4 w-4" />}
              {done === 'lite' ? 'Lite installed' : 'Install Lite app'}
            </Button>
          </div>
        </div>

        {showIOS && !done && (
          <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Finish installing from your browser menu</p>
            <ol className="mt-2 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">1</span>
                <span className="flex items-center gap-1">Tap <Share className="h-4 w-4 text-primary" /> Share (or the browser menu)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">2</span>
                <span className="flex items-center gap-1">Choose <Plus className="h-4 w-4 text-primary" /> “Add to Home Screen”</span>
              </li>
            </ol>
            <p className="mt-2 text-xs">Your app-mode choice is already saved for the installed app.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeInstallCard;
