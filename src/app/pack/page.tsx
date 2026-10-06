import PackBuilder from "@/components/PackBuilder";

export const metadata = { title: "Pack builder" };

export default function PackPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-black">Pack builder</h1>
      <p className="mt-1 mb-6 text-muted">
        Add mods, resource packs and shaders with the <b>+ Pack</b> button on any version, then export a
        <code className="mx-1 rounded bg-panel-2 px-1">.mrpack</code> you can import into Prism Launcher, ATLauncher or the Modrinth App.
      </p>
      <PackBuilder />
    </div>
  );
}
