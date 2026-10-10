/**
 * Interior-design photography for the desk theme (Unsplash, free licence; photographers vary).
 * Hotlinked from images.unsplash.com; every hero also has a teal fallback colour, so a failed image never breaks the page.
 */
const u = (id: string, w = 2000) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

export const PHOTOS = {
  leads: u("1554995207-c18c203602cb"), // bright living room, teal accent wall
  insights: u("1693382464372-fad822e7b38c"), // airy living room, cane chairs
  monthly: u("1617202009609-74a52df21011"), // plants and warm light
  health: u("1635435605591-217d993deb88"), // lamp and textures
  login: u("1554995207-c18c203602cb", 1600),
} as const;

export const PHOTO_CREDIT = "Photography via Unsplash";
