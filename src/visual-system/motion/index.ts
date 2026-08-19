/**
 * Unified motion surface — ONE import for both motion vocabularies:
 *
 *  - Core curves (src/visual-system/motion/curves.ts): `interpolate`,
 *    `spring`, `SPRING_SMOOTH/SNAPPY/BOUNCY/CRISP`, `Easing`, `stagger`,
 *    `cubicBezier`. Used by every built-in template.
 *  - Motion stdlib (src/visual-system/motion/effects.ts): the export-verified
 *    high-level helpers — `phase`, `staggerWindow`, `cascade`, `typewriter`,
 *    `countUp`, `punch`, `glow`, `meshGradient`, `particles`, `burst`,
 *    `sweep`, `drift`, `orbit`, `EASE`, and friends.
 *
 * This is the stable entrypoint for templates, custom scenes, and the public
 * registry. Keep implementation files behind this facade.
 */

export * from "./curves";
export * from "./effects";
