// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTraceCapabilities } from "@traceforge/schema";
import { CapabilityPanel } from "./CapabilityPanel";

describe("CapabilityPanel", () => {
  it("renders source capabilities and their reasons", () => {
    const capabilities = createTraceCapabilities("browser");

    render(<CapabilityPanel capabilities={capabilities} />);

    expect(screen.getByRole("heading", { name: "Capabilities" })).toBeTruthy();
    expect(screen.getByText("browser")).toBeTruthy();
    expect(screen.getByText("partial")).toBeTruthy();
    expect(screen.getByText(/best-effort scaffolding/i)).toBeTruthy();
    expect(screen.getAllByText("unsupported").length).toBeGreaterThan(0);
  });
});
