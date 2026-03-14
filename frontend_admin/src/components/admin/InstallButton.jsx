import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallButton() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Check if app is already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsVisible(false);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-24 right-6 z-[100] animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-slate-800 p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-700 flex items-center gap-4 max-w-sm ring-1 ring-black/5">
                <div className="bg-yellow-500 p-3 rounded-xl text-white shadow-lg shadow-yellow-500/30">
                    <Download size={20} className="animate-bounce" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-50 leading-tight">Install App</h3>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Use Bus Tracker as a mobile app for a better experience.</p>
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleInstallClick}
                        className="bg-gray-900 text-white text-[11px] font-bold px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors active:scale-95"
                    >
                        INSTALL
                    </button>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="text-[10px] text-slate-500 font-bold hover:text-slate-400 transition-colors text-center"
                    >
                        DISMISS
                    </button>
                </div>
            </div>
        </div>
    );
}
