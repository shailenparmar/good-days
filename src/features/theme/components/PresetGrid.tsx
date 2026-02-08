import { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getItem, setItem } from '@shared/storage';
import { scrambleText } from '@shared/utils/scramble';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { ColorPreset } from '../types';

interface PresetGridProps {
  showDebugMenu: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

export function PresetGrid({ showDebugMenu, superscramble, scrambleSeed }: PresetGridProps) {
  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  const {
    hue, saturation, lightness,
    bgHue, bgSaturation, bgLightness,
    presets, customPresets, activePresetIndex, randomPreview,
    setPresets, setCustomPresets,
    setSelectedPreset, setSelectedCustomPreset, setActivePresetIndex,
    applyPreset, saveCustomPreset, deleteCustomPreset, randomizeTheme,
    getColor,
    livePreset, isLiveActive, setIsLiveActive, saveLivePreset,
  } = useTheme();

  // Live slot shifts rand/save indices by 1 when present
  const hasLive = livePreset !== null;
  const liveSlotCount = hasLive ? 1 : 0;

  const [pulseKey, setPulseKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedPresetsStackRef = useRef<{ preset: ColorPreset; index: number; type: 'default' | 'custom' }[]>([]);

  // Track preset mouse clicks for first-time user hint
  const [presetClickCount, setPresetClickCount] = useState(0);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
  const [hintPermanentlyDismissed, setHintPermanentlyDismissed] = useState(() => {
    return getItem('presetKeyboardHintDismissed') === 'true';
  });
  const [keyboardUseCount, setKeyboardUseCount] = useState(0);

  // Hint animation state
  const hintLine1 = 'navigate with arrow keys.';
  const hintLine2 = 'select with spacebar.';
  const hintLine3 = 'delete with backspace.';
  const hintFullText = hintLine1 + hintLine2 + hintLine3;
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');


  // Reset click count when settings panel opens
  useEffect(() => {
    if (showDebugMenu) {
      setPresetClickCount(0);
    }
  }, [showDebugMenu]);

  // Show hint after 3+ clicks (unless permanently dismissed)
  useEffect(() => {
    if (presetClickCount >= 3 && !hintPermanentlyDismissed) {
      setShowKeyboardHint(true);
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [presetClickCount, hintPermanentlyDismissed]);

  // Permanently dismiss after 3+ keyboard uses
  useEffect(() => {
    if (keyboardUseCount >= 3 && !hintPermanentlyDismissed) {
      setShowKeyboardHint(false);
      setHintPermanentlyDismissed(true);
      setItem('presetKeyboardHintDismissed', 'true');
    }
  }, [keyboardUseCount, hintPermanentlyDismissed]);

  // Handle bold/unbold animation at 12fps
  useEffect(() => {
    if (!showKeyboardHint) return;

    if (animPhase === 'bold') {
      if (boldCount >= hintFullText.length) {
        setAnimPhase('unbold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83); // ~12fps
      return () => clearTimeout(timer);
    }

    if (animPhase === 'unbold') {
      if (boldCount >= hintFullText.length) {
        setAnimPhase('bold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83); // ~12fps
      return () => clearTimeout(timer);
    }
  }, [showKeyboardHint, boldCount, animPhase]);

  // Note: activePresetIndex persists across settings open/close because PresetGrid
  // unmounts when settings closes, so any clearing code here never runs.
  // This is intentional - user expects their selection to persist.

  // Keyboard navigation for presets
  useEffect(() => {
    const handlePresetNavigation = (e: KeyboardEvent) => {
      if (!showDebugMenu) return;

      // Don't handle if focus is on an input, textarea, or contenteditable
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const totalPresets = presets.length + customPresets.length + liveSlotCount + 2; // default + custom + live? + rand + save
      const totalDefaultAndCustom = presets.length + customPresets.length;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardUseCount(c => c + 1);


        const cols = 5;
        let newIndex = activePresetIndex === null ? 0 : activePresetIndex;
        const currentRow = Math.floor(newIndex / cols);

        if (e.key === 'ArrowRight') {
          const rowStart = currentRow * cols;
          const rowEnd = Math.min(rowStart + cols, totalPresets);
          // Stop at end of row (no wrap)
          if (newIndex < rowEnd - 1) {
            newIndex = newIndex + 1;
          }
        } else if (e.key === 'ArrowLeft') {
          const rowStart = currentRow * cols;
          // Stop at start of row (no wrap)
          if (newIndex > rowStart) {
            newIndex = newIndex - 1;
          }
        } else if (e.key === 'ArrowDown') {
          const currentCol = newIndex % cols;
          const itemsInCol = [];
          for (let i = currentCol; i < totalPresets; i += cols) {
            itemsInCol.push(i);
          }
          const posInCol = itemsInCol.indexOf(newIndex);
          // Stop at bottom of column (no wrap)
          if (posInCol < itemsInCol.length - 1) {
            newIndex = itemsInCol[posInCol + 1];
          }
        } else if (e.key === 'ArrowUp') {
          const currentCol = newIndex % cols;
          const itemsInCol = [];
          for (let i = currentCol; i < totalPresets; i += cols) {
            itemsInCol.push(i);
          }
          const posInCol = itemsInCol.indexOf(newIndex);
          // Stop at top of column (no wrap)
          if (posInCol > 0) {
            newIndex = itemsInCol[posInCol - 1];
          }
        }

        setActivePresetIndex(newIndex);

        // Scroll to the active preset button (clear previous timeout to prevent leak)
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          const button = containerRef.current?.querySelector(`[data-preset-index="${newIndex}"]`);
          button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);

        // Auto-apply the preset when navigating
        const liveIndex = totalDefaultAndCustom; // index of live slot (if present)
        if (newIndex < presets.length) {
          const preset = presets[newIndex];
          applyPreset(preset);
          setSelectedPreset(newIndex);
          setSelectedCustomPreset(null);
          setIsLiveActive(false);
        } else if (newIndex < totalDefaultAndCustom) {
          const customIndex = newIndex - presets.length;
          const preset = customPresets[customIndex];
          applyPreset(preset);
          setSelectedPreset(null);
          setSelectedCustomPreset(customIndex);
          setIsLiveActive(false);
        } else if (hasLive && newIndex === liveIndex) {
          // Navigated to [live] slot
          applyPreset(livePreset);
          setSelectedPreset(null);
          setSelectedCustomPreset(null);
          setIsLiveActive(true);
        } else {
          setSelectedPreset(null);
          setSelectedCustomPreset(null);
          setIsLiveActive(false);
        }
      } else if ((e.key === ' ' || e.key === 'Enter') && activePresetIndex !== null) {
        // Space/Enter = click behavior (save current colors to preset)
        e.preventDefault();
        setKeyboardUseCount(c => c + 1);
        setPulseKey(k => k + 1);

        if (activePresetIndex < presets.length) {
          // Default preset - save current colors to it
          const newPresets = [...presets];
          newPresets[activePresetIndex] = {
            hue,
            sat: saturation,
            light: lightness,
            bgHue,
            bgSat: bgSaturation,
            bgLight: bgLightness,
          };
          setPresets(newPresets);
        } else if (activePresetIndex < totalDefaultAndCustom) {
          // Custom preset - save current colors to it
          const customIndex = activePresetIndex - presets.length;
          const newCustomPresets = [...customPresets];
          newCustomPresets[customIndex] = {
            hue,
            sat: saturation,
            light: lightness,
            bgHue,
            bgSat: bgSaturation,
            bgLight: bgLightness,
          };
          setCustomPresets(newCustomPresets);
        } else if (hasLive && activePresetIndex === totalDefaultAndCustom) {
          // [live] slot — no-op (use save button to save)

        } else if (activePresetIndex === totalDefaultAndCustom + liveSlotCount) {
          // Rand
          markEasterEggFound('spacebarRand');
          randomizeTheme();
        } else if (activePresetIndex === totalDefaultAndCustom + liveSlotCount + 1) {
          // Save
          saveCustomPreset();
        }
      }
    };

    window.addEventListener('keydown', handlePresetNavigation, true); // capture phase - runs before App.tsx
    return () => {
      window.removeEventListener('keydown', handlePresetNavigation, true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [showDebugMenu, activePresetIndex, customPresets, presets, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, applyPreset, setActivePresetIndex, setSelectedPreset, setSelectedCustomPreset, setPresets, randomizeTheme, saveCustomPreset, hasLive, livePreset, isLiveActive, setIsLiveActive, saveLivePreset, liveSlotCount]);

  // Handle delete key and Cmd+Z undo for presets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is on an input, textarea, or contenteditable
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Cmd+Z / Ctrl+Z: undo last preset deletion (supports multiple undos)
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && showDebugMenu) {
        const stack = deletedPresetsStackRef.current;
        if (stack.length === 0) return;
        const deleted = stack.pop()!;
        e.preventDefault();

        if (deleted.type === 'default') {
          const newPresets = [...presets];
          newPresets.splice(deleted.index, 0, deleted.preset);
          setPresets(newPresets);
          applyPreset(deleted.preset);
          setSelectedPreset(deleted.index);
          setSelectedCustomPreset(null);
          setActivePresetIndex(deleted.index);
        } else {
          const newCustomPresets = [...customPresets];
          newCustomPresets.splice(deleted.index, 0, deleted.preset);
          setCustomPresets(newCustomPresets);
          applyPreset(deleted.preset);
          setSelectedPreset(null);
          setSelectedCustomPreset(deleted.index);
          setActivePresetIndex(presets.length + deleted.index);
        }

        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && showDebugMenu) {
        setKeyboardUseCount(c => c + 1);
        if (activePresetIndex !== null && activePresetIndex < presets.length) {
          // Delete default preset — save to ref for undo
          e.preventDefault();
          deletedPresetsStackRef.current.push({ preset: presets[activePresetIndex], index: activePresetIndex, type: 'default' });
          const newPresets = presets.filter((_, i) => i !== activePresetIndex);
          setPresets(newPresets);
          // Move to next available preset or stay at end
          if (newPresets.length > 0) {
            const newIndex = Math.min(activePresetIndex, newPresets.length - 1);
            setActivePresetIndex(newIndex);
            applyPreset(newPresets[newIndex]);
            setSelectedPreset(newIndex);
            setSelectedCustomPreset(null);
          } else if (customPresets.length > 0) {
            setActivePresetIndex(0);
            applyPreset(customPresets[0]);
            setSelectedPreset(null);
            setSelectedCustomPreset(0);
          }
        } else if (activePresetIndex !== null && activePresetIndex >= presets.length && activePresetIndex < presets.length + customPresets.length) {
          // Delete custom preset — save to ref for undo
          e.preventDefault();
          const customIndex = activePresetIndex - presets.length;
          deletedPresetsStackRef.current.push({ preset: customPresets[customIndex], index: customIndex, type: 'custom' });
          deleteCustomPreset(customIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture phase - runs before App.tsx
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activePresetIndex, customPresets, presets, showDebugMenu, deleteCustomPreset, setPresets, setCustomPresets, applyPreset, setActivePresetIndex, setSelectedPreset, setSelectedCustomPreset]);

  const handlePresetClick = (index: number, preset: ColorPreset) => {
    // Track mouse clicks for first-time user hint
    setPresetClickCount(c => c + 1);

    const wasActive = activePresetIndex === index;

    if (wasActive) {
      // Already pulsing - save current colors to this preset
      setPulseKey(k => k + 1);
      const newPresets = [...presets];
      newPresets[index] = {
        hue,
        sat: saturation,
        light: lightness,
        bgHue,
        bgSat: bgSaturation,
        bgLight: bgLightness,
      };
      setPresets(newPresets);
    } else {
      applyPreset(preset);
      setSelectedPreset(index);
      setSelectedCustomPreset(null);
      setActivePresetIndex(index);
      setIsLiveActive(false);
    }
  };

  const handleCustomPresetClick = (index: number, preset: ColorPreset) => {
    // Track mouse clicks for first-time user hint
    setPresetClickCount(c => c + 1);

    const wasActive = activePresetIndex === (presets.length + index);

    if (wasActive) {
      setPulseKey(k => k + 1);
      const newCustomPresets = [...customPresets];
      newCustomPresets[index] = {
        hue,
        sat: saturation,
        light: lightness,
        bgHue,
        bgSat: bgSaturation,
        bgLight: bgLightness,
      };
      setCustomPresets(newCustomPresets);
    } else {
      applyPreset(preset);
      setSelectedPreset(null);
      setSelectedCustomPreset(index);
      setActivePresetIndex(presets.length + index);
      setIsLiveActive(false);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="grid grid-cols-5 gap-1">
        {/* Default presets */}
        {presets.map((preset, index) => {
          const textColor = `hsl(${preset.hue}, ${preset.sat}%, ${preset.light}%)`;
          const bgColor = `hsl(${preset.bgHue}, ${preset.bgSat}%, ${preset.bgLight}%)`;
          const isActive = activePresetIndex === index;

          return (
            <button
              key={`default-${index}-${isActive ? pulseKey : 0}`}
              data-preset-index={index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePresetClick(index, preset);
              }}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${isActive ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: bgColor,
                borderColor: textColor,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {s(String(index + 1))}
            </button>
          );
        })}

        {/* Custom presets */}
        {customPresets.map((preset, index) => {
          const presetNumber = presets.length + 1 + index;
          const globalIndex = presets.length + index;
          const textColor = `hsl(${preset.hue}, ${preset.sat}%, ${preset.light}%)`;
          const bgColor = `hsl(${preset.bgHue}, ${preset.bgSat}%, ${preset.bgLight}%)`;
          const isActive = activePresetIndex === globalIndex;

          return (
            <button
              key={`custom-${index}-${isActive ? pulseKey : 0}`}
              data-preset-index={globalIndex}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCustomPresetClick(index, preset);
              }}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${isActive ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: bgColor,
                borderColor: textColor,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {s(String(presetNumber))}
            </button>
          );
        })}

        {/* [live] swatch — only visible when paired */}
        {hasLive && (() => {
          const liveIndex = presets.length + customPresets.length;
          const liveTextColor = `hsl(${livePreset.hue}, ${livePreset.sat}%, ${livePreset.light}%)`;
          const liveBgColor = `hsl(${livePreset.bgHue}, ${livePreset.bgSat}%, ${livePreset.bgLight}%)`;
          const isActive = activePresetIndex === liveIndex;

          return (
            <button
              key={`live-${isActive ? pulseKey : 0}`}
              data-preset-index={liveIndex}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPresetClickCount(c => c + 1);
                if (isLiveActive) {
                  // Already active — restart pulse animation
                  setPulseKey(k => k + 1);
                } else {
                  // Switch to live — don't increment shared pulseKey to avoid
                  // remounting the previously-active button (visual border snap)
                  applyPreset(livePreset);
                  setSelectedPreset(null);
                  setSelectedCustomPreset(null);
                  setIsLiveActive(true);
                  setActivePresetIndex(liveIndex);
                }
              }}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${isActive ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: liveBgColor,
                borderColor: liveTextColor,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: liveTextColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {s('live')}
            </button>
          );
        })()}

        {/* Rand button */}
        {(() => {
          const randIndex = presets.length + customPresets.length + liveSlotCount;
          const textColor = `hsl(${randomPreview.hue}, ${randomPreview.sat}%, ${randomPreview.light}%)`;

          return (
            <button
              key={`rand-${activePresetIndex === randIndex ? pulseKey : 0}`}
              data-preset-index={randIndex}
              onClick={() => {
                setPresetClickCount(c => c + 1);
                setPulseKey(k => k + 1);
                randomizeTheme();
                setActivePresetIndex(randIndex);
                setIsLiveActive(false);
              }}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${activePresetIndex === randIndex ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: `hsl(${randomPreview.bgHue}, ${randomPreview.bgSat}%, ${randomPreview.bgLight}%)`,
                borderColor: textColor,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {s('rand')}
            </button>
          );
        })()}

        {/* Save button */}
        {(() => {
          const saveIndex = presets.length + customPresets.length + liveSlotCount + 1;
          const textColor = getColor();

          return (
            <button
              key={`save-${activePresetIndex === saveIndex ? pulseKey : 0}`}
              data-preset-index={saveIndex}
              onClick={() => {
                setPresetClickCount(c => c + 1);
                setPulseKey(k => k + 1);
                saveCustomPreset();
                setActivePresetIndex(saveIndex);
                setIsLiveActive(false);
              }}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${activePresetIndex === saveIndex ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                borderColor: textColor,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {s('save')}
            </button>
          );
        })()}

      </div>
      {/* Keyboard hint */}
      {showKeyboardHint && (
        <div
          className="text-xs font-mono mt-1"
          style={{ color: getColor(), opacity: 0.85 }}
        >
          {(() => {
            const line1Bold = Math.min(boldCount, hintLine1.length);
            const line2Bold = Math.min(Math.max(0, boldCount - hintLine1.length), hintLine2.length);
            const line3Bold = Math.max(0, boldCount - hintLine1.length - hintLine2.length);

            if (animPhase === 'bold') {
              return (
                <>
                  <div>
                    <span className="font-bold">{hintLine1.slice(0, line1Bold)}</span>
                    <span>{hintLine1.slice(line1Bold)}</span>
                  </div>
                  <div>
                    <span className="font-bold">{hintLine2.slice(0, line2Bold)}</span>
                    <span>{hintLine2.slice(line2Bold)}</span>
                  </div>
                  <div>
                    <span className="font-bold">{hintLine3.slice(0, line3Bold)}</span>
                    <span>{hintLine3.slice(line3Bold)}</span>
                  </div>
                </>
              );
            } else {
              return (
                <>
                  <div>
                    <span>{hintLine1.slice(0, line1Bold)}</span>
                    <span className="font-bold">{hintLine1.slice(line1Bold)}</span>
                  </div>
                  <div>
                    <span>{hintLine2.slice(0, line2Bold)}</span>
                    <span className="font-bold">{hintLine2.slice(line2Bold)}</span>
                  </div>
                  <div>
                    <span>{hintLine3.slice(0, line3Bold)}</span>
                    <span className="font-bold">{hintLine3.slice(line3Bold)}</span>
                  </div>
                </>
              );
            }
          })()}
        </div>
      )}
    </div>
  );
}
