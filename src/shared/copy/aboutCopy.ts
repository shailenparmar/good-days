// Single source of truth for the about page copy.
// AboutPanel.tsx renders this in the app.
// scripts/generate-readme.ts generates README.md from it.

export const ABOUT_COPY = {
  welcome: "welcome to good days pro.",

  privacy: {
    header: "privacy:",
    paragraphs: [
      "entries, passwords, and colorways never leave your hardware. a developer couldn't read your journal even if they wanted to.",
    ],
    lastParagraph: "as a privacy guarantee, the entire product is open source.",
    githubUrl: "https://github.com/shailenparmar/good-days",
  },

  features: {
    header: "features:",
    paragraphs: [
      "a new page spawns at midnight; old logs are set in stone.",
      "keystrokes save in 300ms. clicking the footer bows in to zen mode. \\time delivers a stamp. esc cycles layouts. type while scrambled to slip prying eyes or writer's block. toggle [icon:settings] and [icon:about] together for a poweruser menu.",
      "beam rc colorways with gdays.day in your phone's browser.",
    ],
  },

  closing: "good days pro for macos.",
  signature: "designed by shailen on earth, 2026.",
} as const;
