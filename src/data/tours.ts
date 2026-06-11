export interface TourStep {
  termId: string;
  /** One line connecting this stop to the previous one. */
  blurb: string;
}

export interface Tour {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

/**
 * Guided walk through the GPU pipeline: vertex processing → rasterization →
 * fragment shading → output merging, told through the glossary's own terms.
 */
export const pipelineTour: Tour = {
  id: "pipeline-101",
  title: "Rendering Pipeline 101",
  description:
    "Follow one triangle from a list of coordinates to a pixel on your screen — eleven stops, each with something to play with.",
  steps: [
    { termId: "vertex", blurb: "Everything starts as points in space: the vertices." },
    {
      termId: "transformation-matrices",
      blurb:
        "First job: move those points from the model into the camera's view — pure matrix math.",
    },
    {
      termId: "render-pipeline",
      blurb: "Here's the assembly line those transformed vertices are about to ride.",
    },
    {
      termId: "rasterization",
      blurb: "The pipeline's heart: which pixels does each triangle actually cover?",
    },
    {
      termId: "depth-buffer",
      blurb: "Multiple triangles fight for the same pixel — the depth buffer referees.",
    },
    {
      termId: "shading-models",
      blurb: "Surviving pixels need colors. Shading decides how light becomes color.",
    },
    {
      termId: "shader",
      blurb: "Shading runs as code you write — tiny programs executed millions of times per frame.",
    },
    {
      termId: "texture-mapping",
      blurb: "Most surface detail isn't geometry at all — it's images wrapped onto triangles.",
    },
    {
      termId: "anti-aliasing",
      blurb: "Hard triangle edges meet a finite pixel grid; anti-aliasing smooths the staircase.",
    },
    {
      termId: "frame-buffer",
      blurb: "Every finished pixel lands in one block of memory: the frame you're about to see.",
    },
    {
      termId: "double-buffering",
      blurb:
        "Last trick: finished frames swap onto the screen in one clean flip. That's the pipeline!",
    },
  ],
};
