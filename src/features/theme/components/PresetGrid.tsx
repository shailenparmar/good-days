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
  const [hintDismissed, setHintDismissed] = useState(() => {
    return getItem('presetKeyboardHintDismissed') === 'true';
  });

  // Show hint after 3+ clicks (only for first-time users)
  useEffect(() => {
    if (presetClickCount >= 3 && !hintDismissed) {
      setShowKeyboardHint(true);
      // Auto-dismiss after 10 seconds and remember
      const timeout = setTimeout(() => {
        setShowKeyboardHint(false);
        setHintDismissed(true);
        setItem('presetKeyboardHintDismissed', 'true');
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [presetClickCount, hintDismissed]);

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

      const totalPresets = 5 + customPresets.length + 2; // 5 default + custom + rand + save
      const totalDefaultAndCustom = 5 + customPresets.length;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();

        const cols = 5;
        let newIndex = activePresetIndex === null ? 0 : activePresetIndex;
        const currentRow = Math.floor(newIndex / cols);

        if (e.key === 'ArrowRight') {
          const rowStart = currentRow * cols;
          const rowEnd = Math.min(rowStart + cols, totalPresets);
          const itemsInRow = rowEnd - rowStart;
          const posInRow = newIndex - rowStart;
          const newPosInRow = (posInRow + 1) % itemsInRow;
          newIndex = rowStart + newPosInRow;
        } else if (e.key === 'ArrowLeft') {
          const rowStart = currentRow * cols;
          const rowEnd = Math.min(rowStart + cols, totalPresets);
          const itemsInRow = rowEnd - rowStart;
          const posInRow = newIndex - rowStart;
          const newPosInRow = (posInRow - 1 + itemsInRow) % itemsInRow;
          newIndex = rowStart + newPosInRow;
        } else if (e.key === 'ArrowDown') {
          const currentCol = newIndex % cols;
          const itemsInCol = [];
          for (let i = currentCol; i < totalPresets; i += cols) {
            itemsInCol.push(i);
          }
          const posInCol = itemsInCol.indexOf(newIndex);
          const newPosInCol = (posInCol + 1) % itemsInCol.length;
          newIndex = itemsInCol[newPosInCol];
        } else if (e.key === 'ArrowUp') {
          const currentCol = newIndex % cols;
          const itemsInCol = [];
          for (let i = currentCol; i < totalPresets; i += cols) {
            itemsInCol.push(i);
          }
          const posInCol = itemsInCol.indexOf(newIndex);
          const newPosInCol = (posInCol - 1 + itemsInCol.length) % itemsInCol.length;
          newIndex = itemsInCol[newPosInCol];
        }

        setActivePresetIndex(newIndex);

        // Scroll to the active preset button
        setTimeout(() => {
          const button = containerRef.current?.querySelector(`[data-preset-index="${newIndex}"]`);
          button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);

        // Auto-apply the preset when navigating
        if (newIndex < 5) {
          const preset = presets[newIndex];
          applyPreset(preset);
          setSelectedPreset(newIndex);
          setSelectedCustomPreset(null);
        } else if (newIndex < totalDefaultAndCustom) {
          const customIndex = newIndex - 5;
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

        if (activePresetIndex < 5) {
          // Apply default preset
          const preset = presets[activePresetIndex];
          applyPreset(preset);
          setSelectedPreset(activePresetIndex);
          setSelectedCustomPreset(null);
        } else if (activePresetIndex < totalDefaultAndCustom) {
          // Apply custom preset
          const customIndex = activePresetIndex - 5;
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

        if (activePresetIndex < 5) {
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

  // Handle delete key for custom presets
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
        if (activePresetIndex !== null && activePresetIndex >= 5 && activePresetIndex < 5 + customPresets.length) {
          const customIndex = activePresetIndex - 5;
          deleteCustomPreset(customIndex);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePresetIndex, customPresets, showDebugMenu, deleteCustomPreset]);

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

    const wasActive = activePresetIndex === (5 + index);

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
      setActivePresetIndex(5 + index);
    }
  };

  return (
    <div ref={containerRef} className="max-h-28 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center ${isActive ? 'preset-pulse' : ''}`}
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
          const presetNumber = index + 6;
          const globalIndex = 5 + index;
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
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center ${isActive ? 'preset-pulse' : ''}`}
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
          const randIndex = 5 + customPresets.length;
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
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center ${activePresetIndex === randIndex ? 'preset-pulse' : ''}`}
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
          const saveIndex = 5 + customPresets.length + 1;
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
              className={`h-6 rounded text-xs font-mono font-bold flex items-center justify-center ${activePresetIndex === saveIndex ? 'preset-pulse' : ''}`}
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
    </div>
  );
}
