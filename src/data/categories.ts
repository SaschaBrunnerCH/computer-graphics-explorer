import type { Category } from "./types";

export const categories: Category[] = [
  {
    id: "rendering-fundamentals",
    title: "Rendering Fundamentals",
    icon: "cube",
    tagline: "How a 3D scene becomes pixels on your screen",
  },
  {
    id: "geometry-scene",
    title: "Geometry & Scene",
    icon: "polygon",
    tagline: "The shapes, math, and bookkeeping behind every 3D world",
  },
  {
    id: "shading-materials",
    title: "Shading & Materials",
    icon: "color-correction",
    tagline: "Why surfaces look like metal, plastic, skin, or stone",
  },
  {
    id: "lighting",
    title: "Lighting",
    icon: "brightness",
    tagline: "From a single lamp to light bouncing around a whole scene",
  },
  {
    id: "textures-sampling",
    title: "Textures & Sampling",
    icon: "image",
    tagline: "Wrapping images onto surfaces — and the artifacts that follow",
  },
  {
    id: "post-processing",
    title: "Post-Processing & Effects",
    icon: "effects",
    tagline: "The finishing touches applied to the rendered image",
  },
  {
    id: "realtime-gis",
    title: "Real-Time & GIS",
    icon: "globe",
    tagline: "Tricks that keep cities, terrain, and worlds running at 60 fps",
  },
];

export const categoryById = new Map(categories.map((c) => [c.id, c]));
