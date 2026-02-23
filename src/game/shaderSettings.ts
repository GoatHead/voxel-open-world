export type ShaderSettings = {
  banding: number;
  ambient: number;
  sunlight: number;
  contrast: number;
  saturation: number;
  rim: number;
};

export const DEFAULT_SHADER_SETTINGS: ShaderSettings = {
  banding: 6,
  ambient: 0.48,
  sunlight: 0.84,
  contrast: 1.08,
  saturation: 1.12,
  rim: 0.18,
};
