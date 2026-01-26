import { useState, useEffect } from 'react';

interface LeaderboardEntry {
  playerName: string;
  score: number;
  wpm: number;
  accuracy: number;
  difficulty: 'easy' | 'medium' | 'hard';
  date: string;
}

const PASSAGES = {
  easy: [
    "A wolf was drinking at a spring on a hillside. When he looked up, he saw a lamb just beginning to drink lower down.",
    "The grasshopper spent the summer singing and dancing. The ant worked hard storing food for winter.",
    "A crow sat in a tree with a piece of cheese in her beak. A fox came by and said such sweet words.",
    "The north wind and the sun had a quarrel about which was the stronger.",
    "A hungry fox saw some grapes hanging high on a vine. He tried hard to reach them but could not.",
    "A dog had stolen a piece of meat and was crossing a river on his way home.",
    "A lion was sleeping in his den when a mouse ran over his face and woke him up.",
    "A tortoise wanted to fly and asked an eagle to teach him.",
    "A farmer found a frozen snake in the winter and took pity on it.",
    "The frogs were tired of governing themselves and asked for a king.",
  ],
  medium: [
    "I had called upon my friend, Sherlock Holmes, one day in the autumn of last year and found him in deep conversation with a very stout, florid-faced, elderly gentleman.",
    "To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name.",
    "It is quite a three pipe problem, and I beg that you won't speak to me for fifty minutes.",
    "The world is full of obvious things which nobody by any chance ever observes.",
    "When you have eliminated the impossible, whatever remains, however improbable, must be the truth.",
    "There is nothing more deceptive than an obvious fact.",
    "My mind rebels at stagnation. Give me problems, give me work, give me the most abstruse cryptogram, or the most intricate analysis, and I am in my own proper atmosphere.",
    "You know my method. It is founded upon the observation of trifles.",
    "Crime is common. Logic is rare. Therefore it is upon the logic rather than upon the crime that you should dwell.",
    "I never guess. It is a shocking habit, destructive to the logical faculty.",
  ],
  hard: [
    "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.",
    "Friends, Romans, countrymen, lend me your ears; I come to bury Caesar, not to praise him.",
    "All the world's a stage, and all the men and women merely players: they have their exits and their entrances.",
    "But soft, what light through yonder window breaks? It is the east, and Juliet is the sun.",
    "The quality of mercy is not strained. It droppeth as the gentle rain from heaven upon the place beneath.",
    "Now is the winter of our discontent made glorious summer by this sun of York.",
    "What's in a name? That which we call a rose by any other name would smell as sweet.",
    "The course of true love never did run smooth.",
    "Cowards die many times before their deaths; the valiant never taste of death but once.",
    "This above all: to thine own self be true, and it must follow, as the night the day, thou canst not then be false to any man.",
  ]
};

interface TypingGameProps {
  isActive: boolean;
  onClose: () => void;
  getColor: () => string;
  hue: number;
  saturation: number;
  lightness: number;
  bgHue: number;
  bgSaturation: number;
  bgLightness: number;
}

export default function TypingGame({
  isActive,
  onClose,
  getColor,
  hue,
  saturation,
  lightness,
  bgHue,
  bgSaturation,
  bgLightness
}: TypingGameProps) {
  const [gamePhase, setGamePhase] = useState<'idle' | 'difficulty-select' | 'countdown' | 'playing' | 'finished'>('idle');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [countdown, setCountdown] = useState(5);
  const [gameTimeRemaining, setGameTimeRemaining] = useState(60);
  const [currentPassageWords, setCurrentPassageWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [typedInput, setTypedInput] = useState('');
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [totalCharactersTyped, setTotalCharactersTyped] = useState(0);
  const [correctCharacters, setCorrectCharacters] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('typingGameLeaderboard');
    return saved ? JSON.parse(saved) : [];
  });
  const [playerName, setPlayerName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [currentGameScore, setCurrentGameScore] = useState({ wpm: 0, accuracy: 0, score: 0 });

  // When activated, show difficulty selection
  useEffect(() => {
    if (isActive && gamePhase === 'idle') {
      setGamePhase('difficulty-select');
    } else if (!isActive && gamePhase !== 'idle') {
      setGamePhase('idle');
    }
  }, [isActive]);

  // Helper functions
  const getRandomPassage = (difficulty: 'easy' | 'medium' | 'hard'): string[] => {
    const passages = PASSAGES[difficulty];
    const randomIndex = Math.floor(Math.random() * passages.length);
    return passages[randomIndex].split(' ');
  };

  const getCurrentWord = (): string => {
    return currentPassageWords[currentWordIndex] || '';
  };

  const countCorrectCharacters = (typed: string, target: string): number => {
    let correct = 0;
    for (let i = 0; i < Math.min(typed.length, target.length); i++) {
      if (typed[i] === target[i]) {
        correct++;
      }
    }
    return correct;
  };

  const calculateLiveAccuracy = (): number => {
    if (totalCharactersTyped === 0) return 100;
    const currentCorrect = countCorrectCharacters(typedInput, getCurrentWord());
    const totalCorrect = correctCharacters + currentCorrect;
    return Math.round((totalCorrect / totalCharactersTyped) * 100);
  };

  const calculateLiveWPM = (): number => {
    const timeElapsed = (60 - gameTimeRemaining) / 60; // in minutes
    if (timeElapsed === 0) return 0;
    return Math.round(wordsCompleted / timeElapsed);
  };

  const calculateFinalScore = () => {
    const wpm = calculateLiveWPM();
    const accuracy = calculateLiveAccuracy();
    const score = wpm * (accuracy / 100);

    setCurrentGameScore({
      wpm,
      accuracy,
      score
    });

    return { wpm, accuracy, score };
  };

  // Event handlers
  const handleDifficultySelect = (difficulty: 'easy' | 'medium' | 'hard') => {
    setSelectedDifficulty(difficulty);
    const passage = getRandomPassage(difficulty);
    setCurrentPassageWords(passage);
    setCurrentWordIndex(0);
    setTypedInput('');
    setWordsCompleted(0);
    setTotalCharactersTyped(0);
    setCorrectCharacters(0);
    setCountdown(5);
    setGameTimeRemaining(60);
    setGamePhase('countdown');
  };

  const handleGameEnd = () => {
    setGamePhase('finished');
    calculateFinalScore();
    setShowNamePrompt(true);
  };

  const handleSaveScore = () => {
    if (!playerName.trim()) return;

    const newEntry: LeaderboardEntry = {
      playerName: playerName.trim(),
      score: currentGameScore.score,
      wpm: currentGameScore.wpm,
      accuracy: currentGameScore.accuracy,
      difficulty: selectedDifficulty,
      date: new Date().toISOString(),
    };

    const updatedLeaderboard = [...leaderboard, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setLeaderboard(updatedLeaderboard);
    setShowNamePrompt(false);
  };

  const handleCancelGame = () => {
    setGamePhase('idle');
    onClose();
  };

  const handleExitGame = () => {
    setGamePhase('idle');
    onClose();
  };

  // Countdown timer
  useEffect(() => {
    if (gamePhase === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gamePhase === 'countdown' && countdown === 0) {
      setGamePhase('playing');
    }
  }, [gamePhase, countdown]);

  // Game timer
  useEffect(() => {
    if (gamePhase === 'playing' && gameTimeRemaining > 0) {
      const timer = setTimeout(() => {
        setGameTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gamePhase === 'playing' && gameTimeRemaining === 0) {
      handleGameEnd();
    }
  }, [gamePhase, gameTimeRemaining]);

  // Leaderboard persistence
  useEffect(() => {
    localStorage.setItem('typingGameLeaderboard', JSON.stringify(leaderboard));
  }, [leaderboard]);

  // Input handler
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const handleGameKeydown = (e: KeyboardEvent) => {
      e.preventDefault();

      if (e.key === 'Escape') {
        handleCancelGame();
        return;
      }

      if (e.key === 'Backspace') {
        setTypedInput(prev => prev.slice(0, -1));
        return;
      }

      if (e.key === ' ') {
        const currentWord = getCurrentWord();

        // Check word, update stats, move to next word
        if (typedInput === currentWord) {
          setWordsCompleted(prev => prev + 1);
          setCorrectCharacters(prev => prev + currentWord.length);
        } else {
          setCorrectCharacters(prev => prev + countCorrectCharacters(typedInput, currentWord));
        }
        setTotalCharactersTyped(prev => prev + typedInput.length + 1);
        setTypedInput('');

        // Move to next word in passage
        setCurrentWordIndex(prev => {
          const nextIndex = prev + 1;
          // If end of passage, load new random passage
          if (nextIndex >= currentPassageWords.length) {
            const newPassage = getRandomPassage(selectedDifficulty);
            setCurrentPassageWords(newPassage);
            return 0;
          }
          return nextIndex;
        });
        return;
      }

      if (e.key.length === 1) {
        setTypedInput(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGameKeydown);
    return () => window.removeEventListener('keydown', handleGameKeydown);
  }, [gamePhase, typedInput, currentWordIndex, currentPassageWords, selectedDifficulty]);

  if (!isActive) return null;

  return (
    <>
      {/* Leaderboard in Sidebar - rendered separately in App.tsx */}

      {/* Difficulty Selection Overlay */}
      {gamePhase === 'difficulty-select' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%, 0.95)`
        }}>
          <div className="space-y-6 max-w-md w-full px-8">
            <h2 className="text-4xl font-bold font-mono text-center mb-8" style={{ color: getColor() }}>
              Select Difficulty
            </h2>
            <div className="space-y-4">
              <button
                onClick={() => handleDifficultySelect('easy')}
                className="w-full px-8 py-4 text-xl font-mono rounded hover:opacity-80 transition-opacity"
                style={{ border: `2px solid ${getColor()}`, color: getColor() }}
              >
                Easy - Aesop's Fables
              </button>
              <button
                onClick={() => handleDifficultySelect('medium')}
                className="w-full px-8 py-4 text-xl font-mono rounded hover:opacity-80 transition-opacity"
                style={{ border: `2px solid ${getColor()}`, color: getColor() }}
              >
                Medium - Sherlock Holmes
              </button>
              <button
                onClick={() => handleDifficultySelect('hard')}
                className="w-full px-8 py-4 text-xl font-mono rounded hover:opacity-80 transition-opacity"
                style={{ border: `2px solid ${getColor()}`, color: getColor() }}
              >
                Hard - Shakespeare
              </button>
            </div>
            <button
              onClick={handleCancelGame}
              className="w-full px-4 py-2 text-sm font-mono hover:opacity-70 transition-opacity"
              style={{ color: getColor() }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Countdown Overlay */}
      {gamePhase === 'countdown' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%, 0.95)`
        }}>
          <div className="text-9xl font-bold font-mono animate-pulse" style={{ color: getColor() }}>
            {countdown}
          </div>
        </div>
      )}

      {/* Game Interface */}
      {gamePhase === 'playing' && (
        <div className="flex-1 flex flex-col">
          {/* Timer Header */}
          <div className="px-8 py-4 border-b" style={{
            backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
            borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`
          }}>
            <div className="flex justify-between items-center">
              <div className="text-lg font-mono font-bold" style={{ color: getColor() }}>
                Time: {gameTimeRemaining}s
              </div>
              <div className="text-sm font-mono" style={{ color: getColor() }}>
                Words: {wordsCompleted} | WPM: {calculateLiveWPM()} | {selectedDifficulty.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Teleprompter Display */}
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            {/* Words context - show previous, current, and next words */}
            <div className="text-2xl font-mono mb-8 flex flex-wrap justify-center gap-3">
              {currentPassageWords.slice(Math.max(0, currentWordIndex - 2), currentWordIndex + 8).map((word, i) => {
                const actualIndex = Math.max(0, currentWordIndex - 2) + i;
                const isCurrent = actualIndex === currentWordIndex;
                const isPast = actualIndex < currentWordIndex;

                return (
                  <span
                    key={actualIndex}
                    className={isCurrent ? 'font-bold' : ''}
                    style={{
                      color: isPast
                        ? getColor().replace('hsl', 'hsla').replace(')', ', 0.3)')
                        : isCurrent
                        ? getColor()
                        : getColor().replace('hsl', 'hsla').replace(')', ', 0.6)')
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>

            {/* Typed Input Display */}
            <div className="text-2xl font-mono flex items-center">
              {typedInput.split('').map((char, i) => {
                const currentWord = getCurrentWord();
                const isCorrect = i < currentWord.length && char === currentWord[i];
                return (
                  <span
                    key={i}
                    style={{
                      color: isCorrect ? getColor() : 'hsl(0, 80%, 50%)',
                    }}
                  >
                    {char}
                  </span>
                );
              })}
              <span className="animate-pulse ml-1" style={{ color: getColor() }}>|</span>
            </div>
          </div>

          {/* Stats Footer */}
          <div className="px-8 py-3 border-t text-xs font-mono" style={{
            backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
            borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
            color: getColor()
          }}>
            Accuracy: {calculateLiveAccuracy()}% | Characters: {totalCharactersTyped}
          </div>
        </div>
      )}

      {/* Game Results Screen */}
      {gamePhase === 'finished' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-4xl font-bold font-mono mb-8" style={{ color: getColor() }}>
            Game Over!
          </div>

          <div className="space-y-4 mb-8 text-center">
            <div className="text-2xl font-mono" style={{ color: getColor() }}>
              Score: {currentGameScore.score.toFixed(0)}
            </div>
            <div className="text-lg font-mono" style={{ color: getColor() }}>
              {currentGameScore.wpm} WPM × {currentGameScore.accuracy}% accuracy
            </div>
            <div className="text-sm font-mono" style={{ color: getColor() }}>
              {wordsCompleted} words completed ({selectedDifficulty})
            </div>
          </div>

          {showNamePrompt ? (
            <div className="space-y-4 w-full max-w-sm">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full px-4 py-2 text-center font-mono rounded focus:outline-none"
                style={{
                  backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                  borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
                  borderWidth: '2px',
                  color: getColor(),
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && playerName.trim()) {
                    handleSaveScore();
                  }
                }}
              />
              <button
                onClick={handleSaveScore}
                disabled={!playerName.trim()}
                className="w-full px-6 py-2 font-mono rounded disabled:opacity-50"
                style={{
                  backgroundColor: getColor(),
                  color: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`,
                }}
              >
                Save Score
              </button>
            </div>
          ) : (
            <button
              onClick={handleExitGame}
              className="px-6 py-2 font-mono rounded"
              style={{
                borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
                borderWidth: '2px',
                color: getColor(),
              }}
            >
              Back to Journal
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Export leaderboard component separately
export function TypingGameLeaderboard({
  getColor,
  hue,
  saturation,
  lightness
}: {
  getColor: () => string;
  hue: number;
  saturation: number;
  lightness: number;
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('typingGameLeaderboard');
    return saved ? JSON.parse(saved) : [];
  });

  // Listen for leaderboard updates
  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem('typingGameLeaderboard');
      if (saved) {
        setLeaderboard(JSON.parse(saved));
      }
    };

    window.addEventListener('storage', handleStorage);

    // Also poll for changes (in case updates happen in same window)
    const interval = setInterval(handleStorage, 500);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4 border-b" style={{ borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)` }}>
        <h2 className="text-2xl font-bold font-mono" style={{ color: getColor() }}>
          Leaderboard
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {leaderboard.length === 0 ? (
          <div className="text-sm font-mono text-center py-8" style={{ color: getColor() }}>
            No scores yet!
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={index}
                className="p-3 rounded border font-mono text-xs"
                style={{
                  borderColor: `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 36)}%, 0.3)`,
                  color: getColor(),
                }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold">#{index + 1} {entry.playerName}</span>
                  <span className="font-bold">{entry.score.toFixed(0)}</span>
                </div>
                <div className="flex gap-4 text-xs opacity-70">
                  <span>{entry.wpm} WPM</span>
                  <span>{entry.accuracy}% acc</span>
                  <span className="uppercase">{entry.difficulty}</span>
                </div>
                <div className="text-xs opacity-50 mt-1">
                  {new Date(entry.date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
