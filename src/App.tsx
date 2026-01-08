import { useState, useEffect, useRef } from 'react';
import { Settings, Calendar, Download, Copy } from 'lucide-react';

interface JournalEntry {
  date: string; // YYYY-MM-DD format
  content: string;
  startedAt?: number; // Timestamp when entry was first created
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [currentContent, setCurrentContent] = useState<string>('');
  const [isLocked, setIsLocked] = useState(() => {
    const saved = localStorage.getItem('isLocked');
    return saved === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showDebugMenu, setShowDebugMenu] = useState(false);
  const [isScrambled, setIsScrambled] = useState(false);
  const [timestampThreshold, setTimestampThreshold] = useState(() => {
    const saved = localStorage.getItem('timestampThreshold');
    return saved ? Number(saved) : 10; // Default 10 minutes
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeUntilMidnight, setTimeUntilMidnight] = useState('');
  const [hue, setHue] = useState(() => {
    const saved = localStorage.getItem('colorHue');
    return saved ? Number(saved) : 174;
  });
  const [saturation, setSaturation] = useState(() => {
    const saved = localStorage.getItem('colorSaturation');
    return saved ? Number(saved) : 72;
  });
  const [lightness, setLightness] = useState(() => {
    const saved = localStorage.getItem('colorLightness');
    return saved ? Number(saved) : 56;
  });
  const [bgHue, setBgHue] = useState(() => {
    const saved = localStorage.getItem('bgHue');
    return saved ? Number(saved) : 0;
  });
  const [bgSaturation, setBgSaturation] = useState(() => {
    const saved = localStorage.getItem('bgSaturation');
    return saved ? Number(saved) : 0;
  });
  const [bgLightness, setBgLightness] = useState(() => {
    const saved = localStorage.getItem('bgLightness');
    return saved ? Number(saved) : 0;
  });
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [presets, setPresets] = useState(() => {
    // Load presets from localStorage on initialization
    const savedPresets = localStorage.getItem('colorPresets');
    const defaultPresets = [
      { hue: 19, sat: 50, light: 10, bgHue: 145, bgSat: 48, bgLight: 74 },
      { hue: 0, sat: 100, light: 59, bgHue: 268, bgSat: 45, bgLight: 11 },
      { hue: 35, sat: 86, light: 68, bgHue: 30, bgSat: 100, bgLight: 15 },
      { hue: 241, sat: 100, light: 46, bgHue: 59, bgSat: 100, bgLight: 48 },
    ];

    if (savedPresets) {
      const parsed = JSON.parse(savedPresets);
      // If old format with 5 presets, only use first 4
      if (parsed.length > 4) {
        return parsed.slice(0, 4);
      }
      return parsed;
    }
    // Default presets if nothing saved (4 presets, 5th is rand button)
    return defaultPresets;
  });
  const [randomPreview, setRandomPreview] = useState({ hue: 0, sat: 50, light: 50, bgHue: 0, bgSat: 0, bgLight: 10 });
  const [totalKeystrokes, setTotalKeystrokes] = useState(() => {
    const saved = localStorage.getItem('totalKeystrokes');
    return saved ? Number(saved) : 0;
  });
  const [password, setPassword] = useState(() => {
    const saved = localStorage.getItem('journalPassword');
    return saved || 'shai';
  });
  const [passwordChangeStep, setPasswordChangeStep] = useState<'current' | 'new'>('current');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const lastTypedTime = useRef<number>(Date.now());
  const lastContentLength = useRef<number>(0);
  const hasInsertedTimestamp = useRef<boolean>(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const bgPickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const unscrambledContent = useRef<string>('');

  // Load entries from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('journalEntries');
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }, []);

  // Ensure today's entry always exists
  useEffect(() => {
    const today = getTodayDate();
    const todayEntry = entries.find(e => e.date === today);

    if (!todayEntry) {
      const newEntries = [...entries, {
        date: today,
        content: '',
        startedAt: Date.now(),
      }].sort((a, b) => b.date.localeCompare(a.date));

      setEntries(newEntries);
      localStorage.setItem('journalEntries', JSON.stringify(newEntries));
    }
  }, [entries]);

  // Populate editor when selectedDate changes
  useEffect(() => {
    if (!editorRef.current) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';

    // Only update if not currently typing
    if (document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = content;
      setCurrentContent(content);
      lastContentLength.current = editorRef.current.textContent?.length || 0;
    }
  }, [entries, selectedDate]);

  // Save color settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('colorHue', String(hue));
    localStorage.setItem('colorSaturation', String(saturation));
    localStorage.setItem('colorLightness', String(lightness));
    localStorage.setItem('bgHue', String(bgHue));
    localStorage.setItem('bgSaturation', String(bgSaturation));
    localStorage.setItem('bgLightness', String(bgLightness));
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]);

  // Save presets to localStorage when they change
  useEffect(() => {
    localStorage.setItem('colorPresets', JSON.stringify(presets));
  }, [presets]);

  // Save timestamp threshold to localStorage
  useEffect(() => {
    localStorage.setItem('timestampThreshold', String(timestampThreshold));
  }, [timestampThreshold]);

  // Save total keystrokes to localStorage
  useEffect(() => {
    localStorage.setItem('totalKeystrokes', String(totalKeystrokes));
  }, [totalKeystrokes]);

  // Save lock state to localStorage
  useEffect(() => {
    localStorage.setItem('isLocked', String(isLocked));
  }, [isLocked]);

  // Update current time and time until midnight every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now);

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(msUntilMidnight / (1000 * 60 * 60));
      const minutes = Math.floor((msUntilMidnight % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msUntilMidnight % (1000 * 60)) / 1000);

      setTimeUntilMidnight(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTime(); // Initial update
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Clear selected preset when settings menu is closed
  useEffect(() => {
    if (!showDebugMenu) {
      setSelectedPreset(null);
      setPasswordChangeStep('current');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
    }
  }, [showDebugMenu]);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDebugMenu && settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        // Check if click was on the settings button itself
        const target = event.target as HTMLElement;
        if (!target.closest('button[data-settings-toggle]')) {
          setShowDebugMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDebugMenu]);

  // Handle scrambling
  useEffect(() => {
    if (!editorRef.current) return;

    if (isScrambled) {
      // Store original content before scrambling
      unscrambledContent.current = editorRef.current.innerHTML;
      // Scramble all text nodes while preserving HTML structure (line breaks, etc.)
      scrambleNode(editorRef.current);
    } else {
      // Restore original content
      if (unscrambledContent.current) {
        editorRef.current.innerHTML = unscrambledContent.current;
        unscrambledContent.current = '';
      }
    }
  }, [isScrambled]);

  // Handle day change (midnight or manual)
  const handleDayChange = () => {
    console.log('=== DAY CHANGE STARTED ===');
    const currentDate = selectedDate;
    const todayDate = getTodayDate();

    console.log('Currently viewing date:', currentDate);
    console.log('Today\'s actual date:', todayDate);

    // Save current content before switching
    if (editorRef.current) {
      const content = editorRef.current.innerHTML || '';
      const textContent = editorRef.current.textContent || '';

      console.log('Editor has content:', textContent.length, 'chars');

      if (textContent.trim()) {
        // Use functional update to get latest entries
        setEntries(prevEntries => {
          console.log('Previous entries count:', prevEntries.length);

          const newEntries = [...prevEntries];
          const existingIndex = newEntries.findIndex(e => e.date === currentDate);

          if (existingIndex >= 0) {
            console.log('Updating existing entry for', currentDate);
            newEntries[existingIndex] = {
              date: currentDate,
              content,
              startedAt: newEntries[existingIndex].startedAt || Date.now(),
            };
          } else {
            console.log('Creating new entry for', currentDate);
            newEntries.push({
              date: currentDate,
              content,
              startedAt: Date.now(),
            });
          }

          newEntries.sort((a, b) => b.date.localeCompare(a.date));

          console.log('New entries count:', newEntries.length);
          localStorage.setItem('journalEntries', JSON.stringify(newEntries));
          console.log('✓ Saved to localStorage');

          return newEntries;
        });
      } else {
        console.log('No content to save (empty)');
      }
    } else {
      console.log('Editor ref not available');
    }

    // Switch to today's date
    console.log('Switching to:', todayDate);
    setSelectedDate(todayDate);

    // Reset tracking
    lastTypedTime.current = Date.now();
    hasInsertedTimestamp.current = false;
    lastContentLength.current = 0;

    console.log('=== DAY CHANGE COMPLETE ===');
  };

  // Automatic midnight detection - trigger exactly at 12:00am
  useEffect(() => {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0); // Set to midnight

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      console.log('Scheduling midnight check in', Math.round(msUntilMidnight / 1000 / 60), 'minutes');

      return setTimeout(() => {
        handleDayChange();
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    // Schedule the first midnight check
    const timeoutId = scheduleNextMidnight();

    return () => clearTimeout(timeoutId);
  }, []);


  // ESC key to lock (only lock, not unlock)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLocked) {
        // Force save before locking
        if (editorRef.current) {
          saveEntry(editorRef.current.innerHTML || '', Date.now());
        }
        setIsLocked(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, entries, selectedDate]);

  // Handle date changes
  useEffect(() => {
    // Clear unscrambled backup when changing dates
    unscrambledContent.current = '';

    // Turn off scramble mode when switching dates
    setIsScrambled(false);

    // Reset the timer when switching dates
    lastTypedTime.current = Date.now();
  }, [selectedDate]);

  // Auto-insert timestamp after 5 seconds of inactivity
  useEffect(() => {
    const checkAndInsertTimestamp = () => {
      if (!editorRef.current || document.activeElement !== editorRef.current) return;

      const now = Date.now();
      const timeSinceLastType = now - lastTypedTime.current;
      const thresholdMs = timestampThreshold * 60 * 1000;

      const currentText = editorRef.current.textContent || '';

      // Only insert if threshold time passed, has content, hasn't already inserted a timestamp for this pause
      if (timeSinceLastType >= thresholdMs && currentText.trim() !== '' && lastContentLength.current > 0 && !hasInsertedTimestamp.current) {
        const timestamp = formatTimestamp(now);

        // Create timestamp element
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp-separator';
        timestampDiv.contentEditable = 'false';

        const line = document.createElement('div');
        line.className = 'timestamp-line';

        const text = document.createElement('div');
        text.className = 'timestamp-text';
        text.textContent = timestamp;

        timestampDiv.appendChild(line);
        timestampDiv.appendChild(text);

        // Get current HTML and add timestamp at the end
        const currentHTML = editorRef.current.innerHTML;
        editorRef.current.innerHTML = currentHTML + '<br><br>' + timestampDiv.outerHTML + '<br>';

        // Move cursor to end
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        // Mark that we've inserted a timestamp for this pause
        hasInsertedTimestamp.current = true;
        lastContentLength.current = editorRef.current.textContent?.length || 0;

        // Save the updated content
        setCurrentContent(editorRef.current.textContent || '');
        saveEntry(editorRef.current.innerHTML || '');
      }
    };

    const interval = setInterval(checkAndInsertTimestamp, 1000); // Check every second
    return () => clearInterval(interval);
  }, [currentContent, timestampThreshold]);

  // Handle typing
  const handleInput = () => {
    if (!editorRef.current) return;

    const newContent = editorRef.current.textContent || '';
    const now = Date.now();

    // Increment total keystroke counter
    setTotalKeystrokes(prev => prev + 1);

    // Check if we should insert a timestamp BEFORE resetting the timer
    const timeSinceLastType = now - lastTypedTime.current;
    const thresholdMs = timestampThreshold * 60 * 1000;

    if (timeSinceLastType >= thresholdMs && newContent.trim() !== '' && lastContentLength.current > 0 && !hasInsertedTimestamp.current) {
      const timestamp = formatTimestamp(now);

      // Create timestamp element
      const timestampDiv = document.createElement('div');
      timestampDiv.className = 'timestamp-separator';
      timestampDiv.contentEditable = 'false';

      const line = document.createElement('div');
      line.className = 'timestamp-line';

      const text = document.createElement('div');
      text.className = 'timestamp-text';
      text.textContent = timestamp;

      timestampDiv.appendChild(line);
      timestampDiv.appendChild(text);

      // Get current HTML and add timestamp at the end
      const currentHTML = editorRef.current.innerHTML;
      editorRef.current.innerHTML = currentHTML + '<br><br>' + timestampDiv.outerHTML + '<br>';

      // Move cursor to end
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Mark that we've inserted a timestamp for this pause
      hasInsertedTimestamp.current = true;
      lastContentLength.current = editorRef.current.textContent?.length || 0;
    }

    // Reset the timestamp insertion flag when user types
    hasInsertedTimestamp.current = false;

    // Check if content was deleted after a timestamp
    const timestamps = editorRef.current.querySelectorAll('.timestamp-separator');

    // Remove timestamps that have no content after them
    timestamps.forEach((timestamp, index) => {
      const isLastTimestamp = index === timestamps.length - 1;
      if (isLastTimestamp) {
        // Check if there's meaningful content after the last timestamp
        const timestampNode = timestamp as HTMLElement;
        const parent = timestampNode.parentElement;
        if (parent) {
          let hasContentAfter = false;
          let node = timestampNode.nextSibling;
          while (node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
              hasContentAfter = true;
              break;
            }
            if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).textContent?.trim()) {
              hasContentAfter = true;
              break;
            }
            node = node.nextSibling;
          }

          if (!hasContentAfter) {
            // Remove the timestamp and surrounding breaks
            let prev = timestampNode.previousSibling;
            let next = timestampNode.nextSibling;

            // Remove preceding line breaks
            while (prev && (prev.nodeName === 'BR' || (prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()))) {
              const toRemove = prev;
              prev = prev.previousSibling;
              toRemove.remove();
            }

            // Remove following line breaks
            while (next && (next.nodeName === 'BR' || (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()))) {
              const toRemove = next;
              next = next.nextSibling;
              toRemove.remove();
            }

            timestampNode.remove();
          }
        }
      }
    });

    lastTypedTime.current = now;
    lastContentLength.current = newContent.length;
    setCurrentContent(newContent);
    saveEntry(editorRef.current.innerHTML || '', now);
  };

  // Save content
  const saveEntry = (content: string, timestamp?: number) => {
    const existingIndex = entries.findIndex(e => e.date === selectedDate);
    let newEntries: JournalEntry[];

    // Get text content - if editor is mounted use it, otherwise parse from HTML
    let textContent = '';
    if (editorRef.current) {
      textContent = editorRef.current.textContent || '';
    } else {
      // Parse text from HTML when editor is unmounted
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      textContent = tempDiv.textContent || '';
    }

    const isToday = selectedDate === getTodayDate();

    if (textContent.trim() === '') {
      // Don't remove today's entry even if empty - keep it in the list
      if (isToday) {
        if (existingIndex >= 0) {
          // Update existing today entry with empty content
          newEntries = [...entries];
          newEntries[existingIndex] = {
            date: selectedDate,
            content,
            startedAt: entries[existingIndex].startedAt || timestamp || Date.now(),
          };
        } else {
          // Create new today entry with empty content
          newEntries = [...entries, {
            date: selectedDate,
            content,
            startedAt: timestamp || Date.now(),
          }];
        }
      } else {
        // Remove entry if empty and not today
        newEntries = entries.filter(e => e.date !== selectedDate);
      }
    } else if (existingIndex >= 0) {
      // Update existing (preserve startedAt)
      newEntries = [...entries];
      newEntries[existingIndex] = {
        date: selectedDate,
        content,
        startedAt: entries[existingIndex].startedAt || timestamp || Date.now(),
      };
    } else {
      // Add new with startedAt timestamp
      newEntries = [...entries, {
        date: selectedDate,
        content,
        startedAt: timestamp || Date.now(),
      }];
    }

    // Sort by date descending
    newEntries.sort((a, b) => b.date.localeCompare(a.date));

    setEntries(newEntries);
    localStorage.setItem('journalEntries', JSON.stringify(newEntries));
  };

  // Handle password unlock
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === password) {
      setIsLocked(false);
      setPasswordInput('');
      // Reload from localStorage when unlocking
      const saved = localStorage.getItem('journalEntries');
      if (saved) {
        const loadedEntries = JSON.parse(saved);
        setEntries(loadedEntries);

        // Reload current entry into editor
        const entry = loadedEntries.find((e: JournalEntry) => e.date === selectedDate);
        const content = entry?.content || '';
        setCurrentContent(content);
        if (editorRef.current) {
          editorRef.current.innerHTML = content;
        }
      }
    } else {
      setPasswordInput('');
    }
  };

  // Handle password change
  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordChangeStep === 'current') {
      if (currentPasswordInput === password) {
        setPasswordChangeStep('new');
        setCurrentPasswordInput('');
      } else {
        setCurrentPasswordInput('');
      }
    } else if (passwordChangeStep === 'new') {
      if (newPasswordInput.trim() !== '') {
        setPassword(newPasswordInput);
        localStorage.setItem('journalPassword', newPasswordInput);
        setPasswordChangeStep('current');
        setCurrentPasswordInput('');
        setNewPasswordInput('');
      }
    }
  };

  // Format entries as text
  const formatEntriesAsText = () => {
    if (entries.length === 0) return '';

    // Sort entries by date ascending (oldest first)
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    // Format entries as text
    let textContent = '=== GOOD DAYS WITH SHAI ===\n';
    textContent += `Exported: ${new Date().toLocaleString()}\n`;
    textContent += `Total Entries: ${entries.length}\n`;
    textContent += '='.repeat(50) + '\n\n';

    sortedEntries.forEach(entry => {
      const date = new Date(entry.date + 'T00:00:00');
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      textContent += `\n${'='.repeat(50)}\n`;
      textContent += `${formattedDate.toUpperCase()}\n`;
      if (entry.startedAt) {
        const startTime = new Date(entry.startedAt);
        const hours = String(startTime.getHours()).padStart(2, '0');
        const minutes = String(startTime.getMinutes()).padStart(2, '0');
        const seconds = String(startTime.getSeconds()).padStart(2, '0');
        textContent += `Started at: ${hours}:${minutes}:${seconds}\n`;
      }
      textContent += `${'='.repeat(50)}\n\n`;

      // Get text content from HTML, preserving line breaks
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = entry.content;

      // Convert <br> and block elements to newlines
      tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      tempDiv.querySelectorAll('div, p').forEach(div => {
        const text = div.textContent || '';
        div.replaceWith(text + '\n');
      });

      let plainText = tempDiv.textContent || '';
      // Remove excessive newlines (more than 2 in a row) and trim
      plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();

      textContent += plainText + '\n\n';
    });

    return textContent;
  };

  // Export all entries as text file
  const handleExport = () => {
    const textContent = formatEntriesAsText();
    if (!textContent) return;

    // Create and download file
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy all entries to clipboard
  const handleCopyToClipboard = async () => {
    const textContent = formatEntriesAsText();
    if (!textContent) return;

    try {
      await navigator.clipboard.writeText(textContent);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Generate color values from HSL - use relative lightness adjustments
  const getColor = (lightnessOffset: number = 0) => {
    const adjustedLightness = Math.max(0, Math.min(100, lightness + lightnessOffset));
    return `hsl(${hue}, ${saturation}%, ${adjustedLightness}%)`;
  };

  // Handle color picker drag
  const handlePickerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const updateColor = (clientX: number, clientY: number) => {
      if (!pickerRef.current) return;
      const rect = pickerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

      const newSat = (x / rect.width) * 100;
      const newLight = 100 - (y / rect.height) * 100;

      setSaturation(Math.round(newSat));
      setLightness(Math.round(newLight));
    };

    updateColor(e.clientX, e.clientY);

    const handleMouseMove = (e: MouseEvent) => {
      updateColor(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle background color picker drag
  const handleBgPickerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const updateColor = (clientX: number, clientY: number) => {
      if (!bgPickerRef.current) return;
      const rect = bgPickerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

      const newSat = (x / rect.width) * 100;
      const newLight = 100 - (y / rect.height) * 100;

      setBgSaturation(Math.round(newSat));
      setBgLightness(Math.round(newLight));
    };

    updateColor(e.clientX, e.clientY);

    const handleMouseMove = (e: MouseEvent) => {
      updateColor(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle preset button clicks
  const handlePresetClick = (index: number) => {
    if (selectedPreset === index) {
      // Second click - check if colors have changed
      const preset = presets[index];
      const hasChanged =
        hue !== preset.hue ||
        saturation !== preset.sat ||
        lightness !== preset.light ||
        bgHue !== preset.bgHue ||
        bgSaturation !== preset.bgSat ||
        bgLightness !== preset.bgLight;

      if (hasChanged) {
        // Save current colors to this preset if changed
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
      }
      // Always deselect (stop pulsing) on second click
      setSelectedPreset(null);
    } else {
      // First click - apply preset colors AND select it for editing
      const preset = presets[index];
      setHue(preset.hue);
      setSaturation(preset.sat);
      setLightness(preset.light);
      setBgHue(preset.bgHue);
      setBgSaturation(preset.bgSat);
      setBgLightness(preset.bgLight);
      setSelectedPreset(index);
    }
  };

  // Generate random theme - truly random, no constraints
  const handleRandomTheme = () => {
    const newHue = Math.floor(Math.random() * 360);
    const newSat = Math.floor(Math.random() * 101); // 0-100
    const newLight = Math.floor(Math.random() * 101); // 0-100
    const newBgHue = Math.floor(Math.random() * 360);
    const newBgSat = Math.floor(Math.random() * 101); // 0-100
    const newBgLight = Math.floor(Math.random() * 101); // 0-100

    setHue(newHue);
    setSaturation(newSat);
    setLightness(newLight);
    setBgHue(newBgHue);
    setBgSaturation(newBgSat);
    setBgLightness(newBgLight);

    // Update preview
    setRandomPreview({
      hue: newHue,
      sat: newSat,
      light: newLight,
      bgHue: newBgHue,
      bgSat: newBgSat,
      bgLight: newBgLight,
    });

    setSelectedPreset(null);
  };

  // Scramble text in DOM while preserving structure
  const scrambleNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Scramble text nodes only
      const text = node.textContent || '';
      const scrambled = text.split('').map(char => {
        if (char.match(/[a-zA-Z]/)) {
          const isUpper = char === char.toUpperCase();
          const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
          return isUpper ? randomChar.toUpperCase() : randomChar;
        }
        return char; // Keep numbers, punctuation, spaces, newlines
      }).join('');
      node.textContent = scrambled;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Recursively scramble child nodes
      Array.from(node.childNodes).forEach(child => scrambleNode(child));
    }
  };

  // Lock screen overlay
  if (isLocked) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}>
        <div className="text-center">
          <form onSubmit={handlePasswordSubmit} className="flex flex-col items-center gap-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="border font-mono px-4 py-2 rounded focus:outline-none"
              style={{
                backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
                color: getColor(),
              }}
              autoFocus
            />
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}>
      {/* Dynamic timestamp styles */}
      <style>
        {`
          .timestamp-line {
            background: repeating-linear-gradient(
              to right,
              ${getColor().replace('hsl', 'hsla').replace(')', ', 0.5)')} 0px,
              ${getColor().replace('hsl', 'hsla').replace(')', ', 0.5)')} 8px,
              transparent 8px,
              transparent 12px
            ) !important;
          }
          .timestamp-text {
            color: ${getColor().replace('hsl', 'hsla').replace(')', ', 0.65)')} !important;
          }
          @keyframes preset-pulse {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(0.85);
            }
          }
          .preset-pulse {
            animation: preset-pulse 1s ease-in-out infinite;
          }
          .sidebar-button:hover:not(:disabled) {
            background-color: hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.15) !important;
          }
          input::placeholder {
            color: ${getColor().replace('hsl', 'hsla').replace(')', ', 0.4)')};
            opacity: 1;
          }

          /* Threshold Slider */
          .threshold-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 8px;
            border-radius: 4px;
          }
          .threshold-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: 2px solid ${getColor()};
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
          }
          .threshold-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: 2px solid ${getColor()};
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
          }

          /* Hue Sliders */
          .hue-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 8px;
            border-radius: 4px;
          }
          .hue-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: 2px solid ${getColor()};
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
          }
          .hue-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: 2px solid ${getColor()};
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
          }
        `}
      </style>

      {/* Sidebar */}
      <div className="w-80 flex flex-col min-h-screen" style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
      }}>
        {/* Header - sticky */}
        <div className="sticky top-0 z-10" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderBottom: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
        }}>
          <div className="p-6 pb-4">
            <h1 className="text-2xl font-bold font-mono tracking-tight" style={{ color: getColor() }}>good days with shai</h1>
          </div>

          {/* Stats */}
          <div className="px-6 pb-4 pt-4 space-y-1 border-t" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
            <div className="text-xs font-mono" style={{ color: getColor() }}>
              {entries.length} {entries.length === 1 ? 'day' : 'days'} logged
            </div>
            <div className="text-xs font-mono" style={{ color: getColor() }}>
              {totalKeystrokes.toLocaleString()} keystrokes
            </div>
            <div className="text-xs font-mono" style={{ color: getColor() }}>
              {entries.reduce((sum, e) => sum + (e.content?.length || 0), 0).toLocaleString()} chars written
            </div>
            <div className="text-xs font-mono" style={{ color: getColor() }}>
              {entries.reduce((sum, e) => {
                const words = (e.content || '').split(/\s+/).filter(Boolean).length;
                return sum + words;
              }, 0).toLocaleString()} words total
            </div>
            <div className="text-xs font-mono" style={{ color: getColor() }}>
              {(() => {
                if (entries.length === 0) return '0 day streak';
                let streak = 0;
                let currentDate = new Date();

                while (true) {
                  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                  if (entries.find(e => e.date === dateStr)) {
                    streak++;
                    currentDate.setDate(currentDate.getDate() - 1);
                  } else {
                    break;
                  }
                }
                return `${streak} day ${streak === 1 ? 'streak' : 'streak'}`;
              })()}
            </div>
          </div>
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)` }}>
          {entries.length > 0 && (
            <div className="p-3 space-y-1">
              {entries.map(entry => {
                const isSelected = selectedDate === entry.date;
                return (
                  <button
                    key={entry.date}
                    onClick={() => {
                      setSelectedDate(entry.date);
                      setShowDebugMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded font-mono text-sm cursor-pointer"
                    style={{
                      border: isSelected ? `2px solid ${getColor()}` : '2px solid transparent',
                      color: getColor(),
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = `2px solid ${getColor()}`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = '2px solid transparent';
                      }
                    }}
                  >
                    {formatDate(entry.date)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Buttons at bottom */}
        <div className="p-4 space-y-2" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderTop: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
        }}>
          <button
            onClick={() => setIsScrambled(!isScrambled)}
            className={`sidebar-button w-full px-3 py-2 text-xs font-mono rounded flex items-center justify-center gap-2 ${isScrambled ? 'active' : ''}`}
            style={{
              color: getColor(),
              backgroundColor: isScrambled ? `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.15)` : 'transparent',
              border: `1px solid ${getColor()}`,
            }}
          >
            <span>~~</span>
            <span>{isScrambled ? 'unscramble' : 'scramble'}</span>
          </button>
          <button
            onClick={handleCopyToClipboard}
            disabled={entries.length === 0}
            className="sidebar-button w-full px-3 py-2 text-xs font-mono rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              color: getColor(),
              backgroundColor: 'transparent',
              border: `1px solid ${getColor()}`,
            }}
          >
            <Copy className="w-3 h-3" />
            <span>copy to clipboard</span>
          </button>
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            className="sidebar-button w-full px-3 py-2 text-xs font-mono rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              color: getColor(),
              backgroundColor: 'transparent',
              border: `1px solid ${getColor()}`,
            }}
          >
            <Download className="w-3 h-3" />
            <span>export to txt file</span>
          </button>
          <button
            onClick={() => setShowDebugMenu(!showDebugMenu)}
            data-settings-toggle
            className={`sidebar-button w-full px-3 py-2 text-xs font-mono rounded flex items-center justify-center gap-2 ${showDebugMenu ? 'active' : ''}`}
            style={{
              color: getColor(),
              backgroundColor: showDebugMenu ? `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.15)` : 'transparent',
              border: `1px solid ${getColor()}`,
            }}
          >
            <Settings className="w-3 h-3" />
            <span>settings</span>
          </button>
        </div>
      </div>

      {/* Middle Column - Settings Panel */}
      {showDebugMenu && (
        <div ref={settingsRef} className="w-80 flex flex-col min-h-screen" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderRight: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
        }}>
          {/* Color Picker */}
          {showDebugMenu && (
            <div className="px-6 pb-4 pt-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
              <div className="space-y-3">
                {/* PRESETS */}
                <div>
                  <div className="text-xs font-mono font-bold mb-2" style={{ color: getColor() }}>presets</div>
                  <div className="grid grid-cols-5 gap-1">
                    {presets.map((preset: { hue: number; sat: number; light: number; bgHue: number; bgSat: number; bgLight: number }, index: number) => {
                      const textColor = `hsl(${preset.hue}, ${preset.sat}%, ${preset.light}%)`;
                      const bgColor = `hsl(${preset.bgHue}, ${preset.bgSat}%, ${preset.bgLight}%)`;

                      return (
                        <button
                          key={index}
                          onClick={() => handlePresetClick(index)}
                          className={`h-6 rounded transition-all text-xs font-mono font-bold flex items-center justify-center ${selectedPreset === index ? 'preset-pulse' : ''}`}
                          style={{
                            backgroundColor: bgColor,
                            borderColor: textColor,
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            color: textColor,
                          }}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                    {/* Random button */}
                    <button
                      onClick={handleRandomTheme}
                      className="h-6 rounded transition-all text-xs font-mono font-bold flex items-center justify-center"
                      style={{
                        backgroundColor: `hsl(${randomPreview.bgHue}, ${randomPreview.bgSat}%, ${randomPreview.bgLight}%)`,
                        borderColor: `hsl(${randomPreview.hue}, ${randomPreview.sat}%, ${randomPreview.light}%)`,
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        color: `hsl(${randomPreview.hue}, ${randomPreview.sat}%, ${randomPreview.light}%)`,
                      }}
                    >
                      rand
                    </button>
                  </div>
                </div>

                {/* TEXT COLORS */}
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>text</div>

                  {/* Hue slider */}
                  <div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={hue}
                      onChange={(e) => setHue(Number(e.target.value))}
                      className="w-full h-2 rounded appearance-none cursor-pointer hue-slider"
                      style={{
                        background: 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))'
                      }}
                    />
                  </div>

                  {/* Saturation/Lightness picker */}
                  <div>
                    <div
                      ref={pickerRef}
                      onMouseDown={handlePickerMouseDown}
                      className="relative w-full h-20 rounded cursor-crosshair"
                      style={{
                        background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${hue}, 100%, 50%))`
                      }}
                    >
                      {/* Dot indicator */}
                      <div
                        className="absolute w-3 h-3 border-2 border-white rounded-full shadow-lg pointer-events-none"
                        style={{
                          left: `${saturation}%`,
                          top: `${100 - lightness}%`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: getColor()
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* BACKGROUND COLORS */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>background</div>

                  {/* Background Hue slider */}
                  <div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={bgHue}
                      onChange={(e) => setBgHue(Number(e.target.value))}
                      className="w-full h-2 rounded appearance-none cursor-pointer hue-slider"
                      style={{
                        background: 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))'
                      }}
                    />
                  </div>

                  {/* Background Saturation/Lightness picker */}
                  <div>
                    <div
                      ref={bgPickerRef}
                      onMouseDown={handleBgPickerMouseDown}
                      className="relative w-full h-20 rounded cursor-crosshair"
                      style={{
                        background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${bgHue}, 100%, 50%))`
                      }}
                    >
                      {/* Dot indicator */}
                      <div
                        className="absolute w-3 h-3 border-2 border-white rounded-full shadow-lg pointer-events-none"
                        style={{
                          left: `${bgSaturation}%`,
                          top: `${100 - bgLightness}%`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timestamp Threshold Section */}
          {showDebugMenu && (
            <div className="px-6 pb-4 pt-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
              <label className="block text-xs font-mono font-bold mb-2" style={{ color: getColor() }}>
                threshold: {timestampThreshold >= 1 ? `${timestampThreshold} min` : `${Math.round(timestampThreshold * 60)} sec`}
              </label>
              <input
                type="range"
                min="0.0833"
                max="60"
                step="0.0833"
                value={timestampThreshold}
                onChange={(e) => setTimestampThreshold(Number(e.target.value))}
                className="w-full threshold-slider"
                style={{
                  background: `linear-gradient(to right, ${getColor()} 0%, ${getColor()} ${((timestampThreshold - 0.0833) / (60 - 0.0833)) * 100}%, ${getColor().replace('hsl', 'hsla').replace(')', ', 0.2)')} ${((timestampThreshold - 0.0833) / (60 - 0.0833)) * 100}%, ${getColor().replace('hsl', 'hsla').replace(')', ', 0.2)')} 100%)`
                }}
              />
            </div>
          )}

          {/* Time Display Section */}
          {showDebugMenu && (
            <div className="px-6 pb-4 pt-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
              <div className="text-xs font-mono font-bold space-y-1" style={{ color: getColor() }}>
                <div>time: {currentTime.toLocaleTimeString()}</div>
                <div>date: {currentTime.toLocaleDateString()}</div>
                <div>midnight in: {timeUntilMidnight}</div>
              </div>
            </div>
          )}

          {/* Password Change Section */}
          {showDebugMenu && (
            <div className="px-6 pb-4 pt-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
              <div className="text-xs font-mono font-bold mb-2" style={{ color: getColor() }}>change password</div>
              <form onSubmit={handlePasswordChange} className="space-y-2">
                {passwordChangeStep === 'current' ? (
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="current password"
                    className="w-full px-3 py-2 text-xs font-mono rounded focus:outline-none"
                    style={{
                      backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                      borderColor: getColor(),
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: getColor(),
                    }}
                  />
                ) : (
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="new password"
                    className="w-full px-3 py-2 text-xs font-mono rounded focus:outline-none"
                    style={{
                      backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                      borderColor: getColor(),
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: getColor(),
                    }}
                    autoFocus
                  />
                )}
              </form>
            </div>
          )}

          {/* Testing Section */}
          {showDebugMenu && (
            <div className="px-6 pb-4 pt-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
              <div className="text-xs font-mono font-bold mb-2" style={{ color: getColor() }}>testing</div>
              <div className="space-y-2">
                <button
                  onClick={handleDayChange}
                  className="sidebar-button w-full px-3 py-2 text-xs font-mono rounded"
                  style={{
                    color: getColor(),
                    backgroundColor: 'transparent',
                    border: `1px solid ${getColor()}`,
                  }}
                >
                  new day
                </button>
                <button
                  onClick={() => {
                    console.log('=== STORAGE CHECK ===');
                    console.log('Entries in state:', entries.length);
                    const saved = localStorage.getItem('journalEntries');
                    if (saved) {
                      const parsed = JSON.parse(saved);
                      console.log('Entries in localStorage:', parsed.length);
                      console.log('Dates:', parsed.map((e: any) => e.date));
                    } else {
                      console.log('No entries in localStorage!');
                    }
                    console.log('Lock state:', isLocked);
                    console.log('isLocked in localStorage:', localStorage.getItem('isLocked'));
                  }}
                  className="sidebar-button w-full px-3 py-2 text-xs font-mono rounded"
                  style={{
                    color: getColor(),
                    backgroundColor: 'transparent',
                    border: `1px solid ${getColor()}`,
                  }}
                >
                  check storage
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}>
        {/* Editor header - sticky */}
        <div className="px-8 py-4 sticky top-0 z-10" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderBottom: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
        }}>
          <h2 className="text-lg font-semibold font-mono" style={{ color: getColor() }}>
            {formatDate(selectedDate)}
          </h2>
          <p className="text-sm mt-1 font-mono" style={{ color: getColor() }}>
            [{(() => {
              const entry = entries.find(e => e.date === selectedDate);
              if (entry?.startedAt) {
                const date = new Date(entry.startedAt);
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `started at ${hours}:${minutes}:${seconds}`;
              }
              const date = new Date(selectedDate + 'T00:00:00');
              return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }).toLowerCase();
            })()}]
          </p>
        </div>

        {/* Text editor - custom contenteditable */}
        <div className="flex-1 p-8 relative overflow-y-auto" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}>
          <style>
            {`
              .dynamic-editor {
                caret-color: ${getColor()};
                color: ${getColor()};
              }
              .dynamic-editor:empty:before {
                color: ${getColor().replace('hsl', 'hsla').replace(')', ', 0.3)')};
              }
            `}
          </style>
          <div
            ref={editorRef}
            contentEditable={!isScrambled}
            onInput={handleInput}
            className="w-full h-full focus:outline-none text-base leading-relaxed font-mono whitespace-pre-wrap custom-editor dynamic-editor"
            spellCheck="false"
            data-placeholder="type here"
            suppressContentEditableWarning
          />
        </div>

        {/* Footer info - sticky */}
        <div className="px-8 py-3 text-xs font-mono sticky bottom-0 z-10" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderTop: `1px solid hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
          color: getColor()
        }}>
          {currentContent.length > 0 ? (
            <span>{currentContent.split(/\s+/).filter(Boolean).length} words | {currentContent.length} chars | auto-saved</span>
          ) : (
            <span>waiting for input...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const entryDate = new Date(date);
  entryDate.setHours(0, 0, 0, 0);

  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toLowerCase();

  if (entryDate.getTime() === today.getTime()) {
    return `today (${formattedDate})`;
  } else if (entryDate.getTime() === yesterday.getTime()) {
    return `yesterday (${formattedDate})`;
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).toLowerCase();
  }
}

export default App;
