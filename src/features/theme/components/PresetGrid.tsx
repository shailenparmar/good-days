import { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getItem, setItem } from '@shared/storage';
import type { ColorPreset } from '../types';

interface PresetGridProps {
  showDebugMenu: boolean;
}

export function PresetGrid({ showDebugMenu }: PresetGridProps) {
  const {
    hue, saturation, lightness,
    bgHue, bgSaturation, bgLightness,
    presets, customPresets, activePresetIndex, randomPreview,
    setPresets, setCustomPresets,
    setSelectedPreset, setSelectedCustomPreset, setActivePresetIndex,
    applyPreset, saveCustomPreset, deleteCustomPreset, randomizeTheme,
    getColor,
  } = useTheme();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track preset mouse clicks for first-time user hint
  const [presetClickCount, setPresetClickCount] = useState(0);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
  const [hintPermanentlyDismissed, setHintPermanentlyDismissed] = useState(() => {
    return getItem('presetKeyboardHintDismissed') === 'true';
  });
  const [keyboardUseCount, setKeyboardUseCount] = useState(0);

  // Hint animation state
  const hintLine1 = 'try arrow keys and spacebar.';
  const hintLine2 = 'backspace deletes a preset.';
  const hintFullText = hintLine1 + hintLine2;
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

  // Set/clear active preset when settings menu is opened/closed
  useEffect(() => {
    if (!showDebugMenu) {
      setActivePresetIndex(null);
    }
  }, [showDebugMenu, setActivePresetIndex]);

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

      const totalPresets = presets.length + customPresets.length + 2; // default + custom + rand + save
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

        // Scroll to the active preset button
        setTimeout(() => {
          const button = containerRef.current?.querySelector(`[data-preset-index="${newIndex}"]`);
          button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);

        // Auto-apply the preset when navigating
        if (newIndex < presets.length) {
          const preset = presets[newIndex];
          applyPreset(preset);
          setSelectedPreset(newIndex);
          setSelectedCustomPreset(null);
        } else if (newIndex < totalDefaultAndCustom) {
          const customIndex = newIndex - presets.length;
          const preset = customPresets[customIndex];
          applyPreset(preset);
          setSelectedPreset(null);
          setSelectedCustomPreset(customIndex);
        } else {
          setSelectedPreset(null);
          setSelectedCustomPreset(null);
        }
      } else if (e.key === ' ' && activePresetIndex !== null) {
        // Spacebar to select/apply preset, rand, or save
        e.preventDefault();
        setKeyboardUseCount(c => c + 1);

        if (activePresetIndex < presets.length) {
          // Apply default preset
          const preset = presets[activePresetIndex];
          applyPreset(preset);
          setSelectedPreset(activePresetIndex);
          setSelectedCustomPreset(null);
        } else if (activePresetIndex < totalDefaultAndCustom) {
          // Apply custom preset
          const customIndex = activePresetIndex - presets.length;
          const preset = customPresets[customIndex];
          applyPreset(preset);
          setSelectedPreset(null);
          setSelectedCustomPreset(customIndex);
        } else if (activePresetIndex === totalDefaultAndCustom) {
          // Rand
          randomizeTheme();
        } else if (activePresetIndex === totalDefaultAndCustom + 1) {
          // Save
          saveCustomPreset();
        }
      } else if (e.key === 'Enter' && activePresetIndex !== null) {
        // Enter to save current colors to active preset
        e.preventDefault();

        if (activePresetIndex < presets.length) {
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
        } else if (activePresetIndex === totalDefaultAndCustom) {
          randomizeTheme();
        } else if (activePresetIndex === totalDefaultAndCustom + 1) {
          saveCustomPreset();
        }
      }
    };

    window.addEventListener('keydown', handlePresetNavigation);
    return () => window.removeEventListener('keydown', handlePresetNavigation);
  }, [showDebugMenu, activePresetIndex, customPresets, presets, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, applyPreset, setActivePresetIndex, setSelectedPreset, setSelectedCustomPreset, setPresets, randomizeTheme, saveCustomPreset]);

  // Handle delete key for presets
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

      if ((e.key === 'Delete' || e.key === 'Backspace') && showDebugMenu) {
        setKeyboardUseCount(c => c + 1);
        if (activePresetIndex !== null && activePresetIndex < presets.length) {
          // Delete default preset
          e.preventDefault();
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
          // Delete custom preset
          e.preventDefault();
          const customIndex = activePresetIndex - presets.length;
          deleteCustomPreset(customIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePresetIndex, customPresets, presets, showDebugMenu, deleteCustomPreset, setPresets, applyPreset, setActivePresetIndex, setSelectedPreset, setSelectedCustomPreset]);

  const handlePresetClick = (index: number, preset: ColorPreset) => {
    // Track mouse clicks for first-time user hint
    setPresetClickCount(c => c + 1);

    const wasActive = activePresetIndex === index;

    if (wasActive) {
      // Already pulsing - save current colors to this preset
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
    }
  };

  const handleCustomPresetClick = (index: number, preset: ColorPreset) => {
    // Track mouse clicks for first-time user hint
    setPresetClickCount(c => c + 1);

    const wasActive = activePresetIndex === (presets.length + index);

    if (wasActive) {
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
    }
  };

  return (
    <div ref={containerRef} className="max-h-44 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      <div className="grid grid-cols-5 gap-1">
        {/* Default presets */}
        {presets.map((preset, index) => {
          const textColor = `hsl(${preset.hue}, ${preset.sat}%, ${preset.light}%)`;
          const bgColor = `hsl(${preset.bgHue}, ${preset.bgSat}%, ${preset.bgLight}%)`;
          const borderDefault = `hsla(${preset.hue}, ${preset.sat}%, ${preset.light}%, 0.6)`;
          const borderActive = `hsl(${preset.hue}, ${preset.sat}%, ${Math.max(0, preset.light * 0.65)}%)`;
          const isActive = activePresetIndex === index;
          const isHovered = hoveredIndex === index;
          const isClicked = clickedIndex === index;

          const currentBorder = isClicked ? borderActive : (isHovered ? textColor : borderDefault);

          return (
            <button
              key={`default-${index}`}
              data-preset-index={index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePresetClick(index, preset);
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => { setHoveredIndex(null); setClickedIndex(null); }}
              onMouseDown={() => setClickedIndex(index)}
              onMouseUp={() => setClickedIndex(null)}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${isActive ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: bgColor,
                borderColor: currentBorder,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {index + 1}
            </button>
          );
        })}

        {/* Custom presets */}
        {customPresets.map((preset, index) => {
          const presetNumber = presets.length + 1 + index;
          const globalIndex = presets.length + index;
          const textColor = `hsl(${preset.hue}, ${preset.sat}%, ${preset.light}%)`;
          const bgColor = `hsl(${preset.bgHue}, ${preset.bgSat}%, ${preset.bgLight}%)`;
          const borderDefault = `hsla(${preset.hue}, ${preset.sat}%, ${preset.light}%, 0.6)`;
          const borderActive = `hsl(${preset.hue}, ${preset.sat}%, ${Math.max(0, preset.light * 0.65)}%)`;
          const isActive = activePresetIndex === globalIndex;
          const isHovered = hoveredIndex === globalIndex;
          const isClicked = clickedIndex === globalIndex;

          const currentBorder = isClicked ? borderActive : (isHovered ? textColor : borderDefault);

          return (
            <button
              key={`custom-${index}`}
              data-preset-index={globalIndex}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCustomPresetClick(index, preset);
              }}
              onMouseEnter={() => setHoveredIndex(globalIndex)}
              onMouseLeave={() => { setHoveredIndex(null); setClickedIndex(null); }}
              onMouseDown={() => setClickedIndex(globalIndex)}
              onMouseUp={() => setClickedIndex(null)}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${isActive ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: bgColor,
                borderColor: currentBorder,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              {presetNumber}
            </button>
          );
        })}

        {/* Rand button */}
        {(() => {
          const randIndex = presets.length + customPresets.length;
          const textColor = `hsl(${randomPreview.hue}, ${randomPreview.sat}%, ${randomPreview.light}%)`;
          const borderDefault = `hsla(${randomPreview.hue}, ${randomPreview.sat}%, ${randomPreview.light}%, 0.6)`;
          const borderActive = `hsl(${randomPreview.hue}, ${randomPreview.sat}%, ${Math.max(0, randomPreview.light * 0.65)}%)`;
          const isHovered = hoveredIndex === randIndex;
          const isClicked = clickedIndex === randIndex;
          const currentBorder = isClicked ? borderActive : (isHovered ? textColor : borderDefault);

          return (
            <button
              data-preset-index={randIndex}
              onClick={() => {
                setPresetClickCount(c => c + 1);
                randomizeTheme();
                setActivePresetIndex(randIndex);
              }}
              onMouseEnter={() => setHoveredIndex(randIndex)}
              onMouseLeave={() => { setHoveredIndex(null); setClickedIndex(null); }}
              onMouseDown={() => setClickedIndex(randIndex)}
              onMouseUp={() => setClickedIndex(null)}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${activePresetIndex === randIndex ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: `hsl(${randomPreview.bgHue}, ${randomPreview.bgSat}%, ${randomPreview.bgLight}%)`,
                borderColor: currentBorder,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              rand
            </button>
          );
        })()}

        {/* Save button */}
        {(() => {
          const saveIndex = presets.length + customPresets.length + 1;
          const textColor = getColor();
          const borderDefault = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
          const borderActive = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
          const isHovered = hoveredIndex === saveIndex;
          const isClicked = clickedIndex === saveIndex;
          const currentBorder = isClicked ? borderActive : (isHovered ? textColor : borderDefault);

          return (
            <button
              data-preset-index={saveIndex}
              onClick={() => {
                setPresetClickCount(c => c + 1);
                saveCustomPreset();
                setActivePresetIndex(saveIndex);
              }}
              onMouseEnter={() => setHoveredIndex(saveIndex)}
              onMouseLeave={() => { setHoveredIndex(null); setClickedIndex(null); }}
              onMouseDown={() => setClickedIndex(saveIndex)}
              onMouseUp={() => setClickedIndex(null)}
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center select-none ${activePresetIndex === saveIndex ? 'preset-pulse' : ''}`}
              style={{
                backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                borderColor: currentBorder,
                borderWidth: '3px',
                borderStyle: 'solid',
                color: textColor,
                outline: 'none',
                borderRadius: '6px',
              }}
            >
              save
            </button>
          );
        })()}

      </div>
      {/* Keyboard hint */}
      {showKeyboardHint && (
        <div
          className="text-xs font-mono mt-1"
          style={{ color: getColor(), opacity: 0.9 }}
        >
          {(() => {
            const line1Bold = Math.min(boldCount, hintLine1.length);
            const line2Bold = Math.max(0, boldCount - hintLine1.length);

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
                </>
              );
            }
          })()}
        </div>
      )}
    </div>
  );
}
