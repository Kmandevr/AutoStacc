// Kinds of content inside Pacs. Your Stacc groups and filters files by these. A file's kind is chosen when it is
// uploaded in /admin; without one it is guessed from the file extension using `formats` (first match, in this order).
// A new kind of content is one entry here. label: shown in the library. formats: file extensions, lowercase.
window.CONTENT_TYPES = {
  midi: { label: "MIDI", formats: ["mid", "midi"] },
  samples: { label: "Samples", formats: ["wav", "aif", "aiff", "flac", "mp3", "ogg"] },
  loops: { label: "Loops", formats: [] },
  presets: { label: "Presets", formats: ["fxp", "fxb", "vital", "vitalbank", "h2p", "nmsv", "adv", "adg", "serumpreset"] },
  stems: { label: "Stems", formats: [] },
  "project-files": { label: "Project files", formats: ["als", "flp", "logicx", "rpp", "zip"] },
  images: { label: "Images", formats: ["png", "jpg", "jpeg", "webp", "gif"] },
  video: { label: "Video", formats: ["mp4", "mov", "webm"] },
  documents: { label: "Documents", formats: ["pdf", "txt", "md"] },
  other: { label: "Other", formats: [] }
};
