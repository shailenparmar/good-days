// Single source of truth for the about page copy.
// AboutPanel.tsx renders this in the app.
// scripts/generate-readme.ts generates README.md from it.

export const ABOUT_COPY = {
  welcome: "welcome to good days, your analog journal oasis.",

  privacy: {
    header: "privacy:",
    paragraphs: [
      "entries are not sent to servers. a developer couldn't view your writing even if they wanted to.",
      "everything added lives encrypted or hashed on your hard drive in local browser storage. the app pulls from it to display content, but entries, passwords, and colorways never leave your device's hardware.",
      "Safari is the only major browser with inactivity deletion (7 days); however, if you manually delete site data in browser settings, you'll clear the journal.",
      "as a security guarantee, the entire product is open source.",
    ],
    githubUrl: "https://github.com/shailenparmar/good-days",
  },

  features: {
    header: "features:",
    paragraphs: [
      "a new page spawns at midnight; old logs are set in stone.",
      "keystrokes save in 300ms. clicking the footer bows in to zen mode. \\time delivers a stamp. draft while scrambled to slip prying eyes or writer's block. settings *and* about join forces for a poweruser menu.",
      "The right end of a Chromium address bar shelters an install button. Beyond that door, a standalone app waits. victoriously, pair your phone for RC colorways.",
    ],
  },

  closing: "i hope you like this place. here's to many colorways and many more good days.",
  signature: "- shai",
} as const;
