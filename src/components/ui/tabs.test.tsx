import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function marcaEm(nome: string) {
  return screen.getByRole("tab", { name: nome }).querySelector("[data-marca-aba]");
}

describe("Tabs", () => {
  it("a marca fica só na aba ativa e acompanha a troca", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList classeMarca="bg-primary">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">conteúdo A</TabsContent>
        <TabsContent value="b">conteúdo B</TabsContent>
      </Tabs>,
    );
    expect(marcaEm("A")).toHaveClass("bg-primary");
    expect(marcaEm("B")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "B" }), { button: 0 });
    expect(marcaEm("B")).not.toBeNull();
    expect(screen.getByText("conteúdo B")).toBeVisible();
  });

  it("controlada: a marca segue o value de fora", () => {
    const { rerender } = render(
      <Tabs value="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(marcaEm("A")).not.toBeNull();
    rerender(
      <Tabs value="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(marcaEm("A")).toBeNull();
    expect(marcaEm("B")).not.toBeNull();
  });
});
