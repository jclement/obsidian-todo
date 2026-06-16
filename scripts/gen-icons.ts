#!/usr/bin/env bun
/**
 * Rasterize the app icon to the PNGs the PWA needs. iOS is unreliable at
 * rasterizing an SVG apple-touch-icon, and an edge-to-edge SVG used as a
 * `maskable` icon risks the launcher cropping into the glyph — so we ship PNGs.
 *
 *   bun scripts/gen-icons.ts
 *
 * Outputs (under web/public/):
 *   icon-192.png, icon-512.png   — purpose "any" (rounded card, matches favicon)
 *   icon-maskable-512.png        — purpose "maskable" (full-bleed; OS masks it)
 *   apple-touch-icon.png (180)   — full-bleed (iOS applies its own rounding)
 *
 * The check already sits inside the maskable safe zone (80%-diameter circle),
 * so the maskable/apple variants only need the rounded corners removed so the
 * purple bleeds to every edge.
 */

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dir, "../web/public");
const ACCENT = "#7c3aed";
const CHECK = `<path d="M150 268l64 64 150-150" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${ACCENT}"/>${CHECK}</svg>`;
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${ACCENT}"/>${CHECK}</svg>`;

const png = (svg: string, size: number) =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

const targets: [string, string, number][] = [
  ["icon-192.png", rounded, 192],
  ["icon-512.png", rounded, 512],
  ["icon-maskable-512.png", fullBleed, 512],
  ["apple-touch-icon.png", fullBleed, 180],
];

for (const [name, svg, size] of targets) {
  writeFileSync(join(OUT, name), png(svg, size));
  console.log(`wrote web/public/${name} (${size}×${size})`);
}
