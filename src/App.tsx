import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";

export function App(): React.JSX.Element {
  return (
    <calcite-shell>
      <calcite-navigation slot="header">
        <calcite-navigation-logo
          heading="Computer Graphics Explorer"
          description="Interactive glossary & playground for 3D rendering concepts"
          heading-level="1"
          slot="logo"
        ></calcite-navigation-logo>
      </calcite-navigation>
    </calcite-shell>
  );
}
