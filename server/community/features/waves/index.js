// Waveforms beside names (owner, 2026-10-20), until profile pictures exist: wave.js draws one from the name. Its own
// switch (community.waves): off, names show alone.
import { wave } from "./wave.js";

export default { name: "waves", switch: "community.waves", slots: { nameMark: ({ name }) => wave(name) } };
