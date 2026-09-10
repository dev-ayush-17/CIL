"use client";

export default function DigitalTwinView() {
  return (
    <div className="w-full h-full min-h-[calc(100vh-140px)] rounded-lg overflow-hidden border border-[var(--color-rule)] bg-[#050B14] relative">
      <iframe
        src="/digital-twin/index.html"
        className="w-full h-full border-0 min-h-[750px] w-full"
        title="Digital Twin 3D View"
      />
    </div>
  );
}

export { DigitalTwinView };
