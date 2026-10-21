// Editor-only types, never loaded by pages: window.GS is util.js's GS (plus the namespaces shared modules add, such as
// js/skeleton.js's GS.skeleton), so Serena can follow helpers across files.
type SkeletonShape = "card" | "row" | "line" | "text" | "button" | "tile" | "panel";
interface Skeleton {
  /** n aria-hidden placeholders of a shape (class "sk sk-<shape>"); tag is the child element ("div", "li" or "tr"). */
  html(shape?: SkeletonShape, n?: number, tag?: "div" | "li" | "tr"): string;
  /** Fills el with placeholders and one spoken "Loading…", sets aria-busy="true"; returns el. */
  show<T extends Element | null>(el: T, shape?: SkeletonShape, n?: number): T;
  /** Removes aria-busy and any placeholders left in el; the caller writes the real content. */
  done<T extends Element | null>(el: T): T;
  /** Disables a request button with aria-busy and a leading spinner (label untouched), or undoes it with on = false. */
  busy<T extends HTMLButtonElement | null>(button: T, on?: boolean): T;
  /** show() until whatever draws el first writes, appends or empties it; then done() runs by itself. */
  pending<T extends Element | null>(el: T, shape?: SkeletonShape, n?: number): T;
}
interface Window { GS: typeof GS & { skeleton?: Skeleton }; }
