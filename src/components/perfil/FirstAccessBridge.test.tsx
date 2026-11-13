import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstAccessBridge } from "@/components/perfil/FirstAccessBridge";

describe("FirstAccessBridge", () => {
  it("sem a tela de primeiro acesso ou sem animação, conclui na hora e uma única vez", () => {
    const avatar = document.createElement("span");
    document.body.appendChild(avatar);
    const onDone = vi.fn();
    const { unmount } = render(<FirstAccessBridge from={avatar} dialog={null} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    unmount();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(avatar.style.visibility).toBe("");
    avatar.remove();
  });
});
