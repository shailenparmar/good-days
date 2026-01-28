import { useTheme } from '@features/theme';

interface InstallPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallPanel({ isOpen, onClose }: InstallPanelProps) {
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  const isChromium = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
  const isEdge = /Edg/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);

  return (
    <div
      className="w-[32rem] flex flex-col h-screen overflow-y-auto scrollbar-hide select-none"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onClose}
    >
      {/* Header */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          install good days as a desktop app
        </p>
      </div>

      {/* Instructions */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          {(isChromium || isEdge) && (
            <>
              <p>you're using {isEdge ? 'edge' : 'chrome'}, which supports automatic installation.</p>
              <p>look for the install icon in your address bar (right side), or:</p>
              <p>• click the three dots menu (⋮)</p>
              <p>• select "install good days" or "install app"</p>
              <p>the app will open in its own window and appear in your dock.</p>
            </>
          )}
          {isSafari && (
            <>
              <p>you're using safari. to install:</p>
              <p>• go to file → add to dock</p>
              <p>• or click the share button and select "add to dock"</p>
              <p>the app will appear in your dock and open in its own window.</p>
            </>
          )}
          {isFirefox && (
            <>
              <p>you're using firefox. unfortunately, firefox doesn't support installing web apps directly.</p>
              <p>for the best experience, open good days in safari or chrome and install from there.</p>
            </>
          )}
          {!isChromium && !isEdge && !isSafari && !isFirefox && (
            <>
              <p>to install good days as a desktop app:</p>
              <p>• in chrome/edge: look for the install icon in the address bar</p>
              <p>• in safari: file → add to dock</p>
              <p>the app will open in its own window and appear in your dock.</p>
            </>
          )}
        </div>
      </div>

      {/* Benefits */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>why install?</p>
          <p>• opens in its own window (no browser tabs)</p>
          <p>• lives in your dock for quick access</p>
          <p>• works offline</p>
          <p>• feels like a native app</p>
        </div>
      </div>
    </div>
  );
}
