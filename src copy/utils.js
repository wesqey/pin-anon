export const LS_USER = "carlisle_user";
export const DEFAULT_ROOM = "main";
export const ADMIN_PASSWORD = "EpicMan101";

const adjectives = [
  "Big", "Small", "Fast", "Slow", "Dead", "Sad", "Happy", "Angry",
  "Quiet", "Loud", "Cold", "Hot", "Wet", "Dry", "Old", "New",
  "Half", "Full", "Empty", "Broken", "Fixed", "Lost", "Found", "Hidden",
  "Dizzy", "Sleepy", "Grumpy", "Fancy", "Plain", "Shiny", "Dull", "Tiny",
  "Giant", "Mini", "Mega", "Ultra", "Super", "Hyper", "Turbo", "Extreme",
  "Fuzzy", "Smooth", "Rough", "Sharp", "Blunt", "Thick", "Thin", "Wide"
];

const nouns = [
  "Dog", "Cat", "Fish", "Bird", "Mouse", "Frog", "Bear", "Wolf",
  "Fox", "Deer", "Duck", "Goose", "Cow", "Pig", "Sheep", "Goat",
  "Turtle", "Snail", "Crab", "Shrimp", "Clam", "Squid", "Whale", "Shark",
  "Tree", "Rock", "Cloud", "Moon", "Star", "Sun", "Wind", "Rain",
  "Box", "Cup", "Lamp", "Chair", "Table", "Door", "Window", "Wall",
  "Car", "Truck", "Bike", "Boat", "Plane", "Train", "Bus", "Van",
  "Pizza", "Taco", "Bread", "Cheese", "Apple", "Grape", "Melon", "Berry"
];

export function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function now() {
  return Date.now();
}

export function saveUser(u) {
  localStorage.setItem(LS_USER, JSON.stringify(u));
}

export function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(LS_USER)) || null;
  } catch (e) {
    return null;
  }
}

export const EMPTY = {
  rooms: [{ id: DEFAULT_ROOM, name: "main room", invite: DEFAULT_ROOM }],
  posts: [],
  settings: { whisper: false },
  inviteCodes: {},
  users: {},
  usernames: {}
};

export async function uploadFile(file) {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'x-filename': file.name },
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.url;
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 30) {
    return "USERNAME MUST BE 3-30 CHARACTERS";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return "USERNAME CAN ONLY CONTAIN LETTERS, NUMBERS, HYPHENS, AND UNDERSCORES";
  }
  return null;
}

// Inject global styles once
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  * {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
  }
`;
if (!document.head.querySelector('style[data-carlisle]')) {
  styleSheet.setAttribute('data-carlisle', 'true');
  document.head.appendChild(styleSheet);
}
