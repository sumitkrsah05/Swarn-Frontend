import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TAB_FILL } from "@/lib/starters";
import { Composer, mentionsIn } from "./composer";

function setup(extra: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  render(<Composer variant="docked" onSend={onSend} datasetNames={["sales", "sales_clean", "regions"]} {...extra} />);
  const area = screen.getByRole("combobox", { name: "Ask swarn" }) as HTMLTextAreaElement;
  return { onSend, area };
}

describe("Composer keys", () => {
  it("Enter sends and clears; Shift+Enter does not send", () => {
    const { onSend, area } = setup();
    fireEvent.change(area, { target: { value: "hello" } });
    fireEvent.keyDown(area, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith({ text: "hello", attachment: null, mentions: [] });
    expect(area.value).toBe("");
  });

  it("Tab on an empty input fills the explore prompt", () => {
    const { area } = setup();
    fireEvent.keyDown(area, { key: "Tab" });
    expect(area.value).toBe(TAB_FILL);
  });

  it("does not send an empty prompt", () => {
    const { onSend, area } = setup();
    fireEvent.change(area, { target: { value: "   " } });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("@ opens a dataset combobox that arrow keys and Enter drive", () => {
    const { area, onSend } = setup();
    fireEvent.change(area, { target: { value: "plot @sa" } });
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["sales", "sales_clean"]);
    expect(area.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(area, { key: "ArrowDown" });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(area.value).toBe("plot @sales_clean ");
    // the mention becomes a context chip and travels with the prompt
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith({ text: "plot @sales_clean", attachment: null, mentions: ["sales_clean"] });
  });

  it("the focused dataset is a fixed chip and is always mentioned", () => {
    const { onSend, area } = setup({ focusedDataset: "regions" });
    expect(screen.getByText("@regions")).toBeInTheDocument();
    fireEvent.change(area, { target: { value: "compare @sales " } });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith({ text: "compare @sales", attachment: null, mentions: ["regions", "sales"] });
  });

  it("shows the working overlay with Stop while a run is in progress", () => {
    const onStop = vi.fn();
    setup({ running: true, runningLabel: "loading a CSV…", onStop });
    expect(screen.getByText("swarn is working…")).toBeInTheDocument();
    expect(screen.getByText("loading a CSV…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop the run" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("renders the agent question panel and answers with an option", () => {
    const onAnswer = vi.fn();
    setup({ running: true, question: { requestId: "r1", question: "Apply all fixes?", options: ["all", "none"], default: "none" }, onAnswer });
    expect(screen.getByText("Apply all fixes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^all/ }));
    expect(onAnswer).toHaveBeenCalledWith("all");
  });
});

describe("mentionsIn", () => {
  it("keeps only known names, once each", () => {
    expect(mentionsIn("use @sales and @sales, not @nope", ["sales"])).toEqual(["sales"]);
  });
});
