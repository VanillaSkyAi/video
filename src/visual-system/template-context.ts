/** Shared render context for built-in and project-owned scene templates. */
export interface TemplateStyle {
  brand: {
    name?: string;
    logoUrl?: string;
    font: string;
    scriptFont: string;
    background:
      | { type: "solid"; color: string }
      | { type: "gradient"; colors: [string, string] };
    colors: {
      primary: string;
      secondary: string;
      foreground: string;
      surface: string;
      surfaceElevated: string;
      muted: string;
    };
  };
  preset?: string;
  density?: string;
  motion?: string;
  defaultTextArchetype?: string;
  defaultTransition?: string;
  defaultBackgroundEffect?: string;
}

export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
