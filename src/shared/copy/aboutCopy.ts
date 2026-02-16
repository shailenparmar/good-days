// Single source of truth for the about page copy.
// AboutPanel.tsx renders this in the app.
// scripts/generate-readme.ts generates README.md from it.

export const ABOUT_COPY = {
  welcome: "welcome to good days.",

  privacy: {
    header: "privacy:",
    paragraphs: [
      "entries are not sent to servers. a developer couldn't view your writing even if they wanted to.",
      "everything added lives encrypted or hashed in localstorage. your browser pulls from it to display content, but entries, passwords, and colorways never leave your computer.",
    ],
    lastParagraph: "as a privacy guarantee, the entire product is open source.",
    githubUrl: "https://github.com/shailenparmar/good-days",
  },

  features: {
    header: "features:",
    paragraphs: [
      "a new page spawns at midnight; old logs are set in stone.",
      "keystrokes save in 300ms. clicking the footer bows in to zen mode. \\time delivers a stamp. draft while scrambled to slip prying eyes or writer's block. toggle [icon:settings] and [icon:about] for a poweruser menu.",
      "the right end of a chromium address bar shelters an install button. beyond that door, a standalone app awaits. victoriously, pair your phone for rc colorways.",
    ],
  },

  system: {
    header: "system:",
    paragraphs: [
      "good days is optimized for chromium.",
      "safari automatically deletes localstorage after 7 days of inactivity.",
      "manually deleting site data in browser settings will clear the app.",
    ],
  },

  closing: "i hope you like this place. here's to many colorways and many more good days.",
  signature: "\u2013 shailen",
} as const;
