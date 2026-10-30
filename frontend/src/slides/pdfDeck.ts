// Renders PDF pages in the browser with pdf.js, so PDFs never need to be
// uploaded. Rendered pages are cached as ImageBitmaps, and neighbouring pages
// are pre-rendered so Next/Prev is instant.
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

const CACHE_SIZE = 6;

export class PdfDeck {
  private cache = new Map<string, Promise<ImageBitmap>>();
  private aspects: number[] = [];
  private readonly doc: PDFDocumentProxy;
  private readonly task: PDFDocumentLoadingTask;

  private constructor(task: PDFDocumentLoadingTask, doc: PDFDocumentProxy) {
    this.task = task;
    this.doc = doc;
  }

  static async load(data: ArrayBuffer): Promise<PdfDeck> {
    // pdf.js may transfer (detach) the buffer it gets, so pass a copy.
    const task = getDocument({ data: new Uint8Array(data.slice(0)) });
    const doc = await task.promise;
    const deck = new PdfDeck(task, doc);
    const first = await doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    deck.aspects[0] = vp.width / vp.height;
    return deck;
  }

  get pageCount() {
    return this.doc.numPages;
  }

  /** Width/height of a page (0-based). Pages not yet loaded assume page 1's aspect. */
  aspect(index: number) {
    return this.aspects[index] ?? this.aspects[0];
  }

  /** Render page `index` (0-based) to fit inside width×height device pixels. */
  render(index: number, width: number, height: number): Promise<ImageBitmap> {
    const key = `${index}:${width}x${height}`;
    let p = this.cache.get(key);
    if (p) {
      // refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, p);
      return p;
    }
    p = this.renderUncached(index, width, height);
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    while (this.cache.size > CACHE_SIZE) {
      const oldest = this.cache.keys().next().value!;
      this.cache.get(oldest)!.then((b) => b.close(), () => {});
      this.cache.delete(oldest);
    }
    return p;
  }

  private async renderUncached(index: number, width: number, height: number) {
    const page = await this.doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    this.aspects[index] = base.width / base.height;
    const scale = Math.min(width / base.width, height / base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return createImageBitmap(canvas);
  }

  destroy() {
    for (const p of this.cache.values()) p.then((b) => b.close(), () => {});
    this.cache.clear();
    void this.task.destroy();
  }
}
