export type ProductSurfaceFit = "cover" | "contain";
export type ProductSurfaceMotion = "still" | "pushIn" | "pan";

export function resolveProductSurfaceMotion(value: unknown): ProductSurfaceMotion {
  return value === "still" || value === "pan" ? value : "pushIn";
}
