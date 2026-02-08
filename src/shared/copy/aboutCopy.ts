// Single source of truth for the about page copy.
// AboutPanel.tsx renders this in the app.
// scripts/generate-readme.ts generates README.md from it.

export const ABOUT_COPY = {
  welcome: "welcome to good days, your time-capsule journal oasis.",

  privacy: {
    header: "privacy:",
    paragraphs: [
      "entries are not sent to servers. a developer couldn't view your writing even if they wanted to.",
      "everything added lives encrypted or hashed on your hard drive in local browser storage — long-term data storage. the website pulls from it to display content, but entries, passwords, and colorways never leave your device's hardware.",
      "however, if you manually delete site data in browser settings, you'll clear the journal. notably, Safari is the only major browser with inactivity deletion (7 days). other browsers will only delete data under disk space storage pressure.",
      "as a safety guarantee, the entire product is open source.",
    ],
    githubUrl: "https://github.com/shailenparmar/good-days",
  },

  features: {
    header: "features:",
    paragraphs: [
      "a new page spawns at midnight; old logs are set in stone.",
      "keystrokes save in 300ms. draft while scrambled to slip prying eyes or writer's block. clicking the footer bows in to zen mode. hold spacebar on rand for chaotic good. \\time delivers a stamp. settings and about join forces for a poweruser menu.",
      "write untethered courtesy of a desktop download; the right end of a chrome address bar shelters an install button. in safari, bother the share icon for add to dock.",
    ],
  },

  closing: "i hope this app disappears into your life. here's to many colorways and many more good days.",
  signature: "- shai",
} as const;
