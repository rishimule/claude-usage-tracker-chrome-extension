import { describe, it, expect } from "vitest";
import { usageColor } from "../../src/lib/color";

describe("usageColor", () => {
  it("returns 'green' below 50%", () => {
    expect(usageColor(0)).toBe("green");
    expect(usageColor(49)).toBe("green");
  });
  it("returns 'yellow' from 50% to 69%", () => {
    expect(usageColor(50)).toBe("yellow");
    expect(usageColor(69)).toBe("yellow");
  });
  it("returns 'orange' from 70% to 89%", () => {
    expect(usageColor(70)).toBe("orange");
    expect(usageColor(89)).toBe("orange");
  });
  it("returns 'red' at 90% and above", () => {
    expect(usageColor(90)).toBe("red");
    expect(usageColor(100)).toBe("red");
    expect(usageColor(150)).toBe("red");
  });
  it("clamps negatives to 'green'", () => {
    expect(usageColor(-5)).toBe("green");
  });
});
