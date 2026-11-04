// Holds the chosen presentation while moving between the home page and the
// presenter view, so going back home keeps the slides loaded. It is kept in
// memory only (a page reload clears it): the file never leaves the browser
// unless it is a PPTX that needs converting.

export interface LoadedDeck {
  name: string;
  pdf: ArrayBuffer;
}

let current: LoadedDeck | null = null;

export function setDeck(deck: LoadedDeck | null) {
  current = deck;
}

export function getDeck() {
  return current;
}

export async function convertPptx(file: File): Promise<ArrayBuffer> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/convert", { method: "POST", body });
  if (!res.ok) {
    const msg = (await res.text()).trim();
    throw new Error(msg || `Conversion failed (${res.status})`);
  }
  return res.arrayBuffer();
}
