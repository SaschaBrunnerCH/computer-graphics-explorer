import { Component, Suspense, type ReactNode } from "react";
import { playgrounds } from "../playgrounds/registry";

import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-loader";

class DemoErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <calcite-notice open kind="warning" icon="exclamation-mark-triangle" className="my-4">
          <div slot="title">This playground could not start</div>
          <div slot="message">
            Your browser or device may not support the required graphics features (WebGL2). The
            explanation above still has you covered!
          </div>
        </calcite-notice>
      );
    }
    return this.props.children;
  }
}

/**
 * Renders every playground a term declares, in order — many terms pair a
 * low-level demo with a real-world ArcGIS scene. Each playground loads
 * lazily and fails independently.
 */
export function DemoHost({ demoKeys }: { demoKeys: readonly string[] }): React.JSX.Element {
  const available = demoKeys.filter((key) => playgrounds[key]);

  if (available.length === 0) {
    return (
      <calcite-notice open kind="info" icon="magic-wand" className="my-4">
        <div slot="title">Playground coming soon</div>
        <div slot="message">
          An interactive demo for this term is on the wishlist. Want to build it? Contributions are
          very welcome — see the GitHub link below.
        </div>
      </calcite-notice>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {available.map((key) => {
        const Playground = playgrounds[key];
        return (
          <DemoErrorBoundary key={key}>
            <Suspense
              fallback={
                <div
                  className="flex min-h-64 items-center justify-center"
                  aria-label="Loading playground"
                >
                  <calcite-loader label="Loading playground" />
                </div>
              }
            >
              <Playground />
            </Suspense>
          </DemoErrorBoundary>
        );
      })}
    </div>
  );
}
