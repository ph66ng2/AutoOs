import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GEOMETRIC_SHAPES } from "@/components/perfil/GeometricAvatar";
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { AVATAR_SHAPES, profileAppearance } from "@/lib/profile-appearance";

describe("avatares geométricos", () => {
  it("cada forma da lista tem desenho, e vice-versa", () => {
    expect(Object.keys(GEOMETRIC_SHAPES).sort()).toEqual(AVATAR_SHAPES.map((item) => item.id).sort());
  });

  it("o backend aceita as mesmas formas", () => {
    const auth = readFileSync(path.resolve(__dirname, "../../../src-tauri/src/commands/auth.rs"), "utf8");
    for (const { id } of AVATAR_SHAPES) expect(auth).toContain(`"${id}"`);
  });

  it("perfil com forma mantém a escolha", () => {
    expect(profileAppearance({ id: 3, avatar_icone: "shape-hex", avatar_cor: "#15803D", tema: "light" }).icon).toBe("shape-hex");
  });

  it("desenha a forma inline com a cor do perfil", () => {
    const { container } = render(<ProfileAvatar icon="shape-orb" color="#2563EB" size="lg" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveStyle({ color: "#2563EB" });
    expect(svg?.querySelector("circle")).not.toBeNull();
  });

  it("ícone antigo continua como ícone", () => {
    const { container } = render(<ProfileAvatar icon="printer" color="#2563EB" />);
    expect(container.querySelector("svg.lucide")).not.toBeNull();
  });
});
