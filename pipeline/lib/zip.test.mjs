import { describe, expect, it } from "vitest";
import { readZipMembers } from "./zip.mjs";

const ok = (stdout) => ({ status: 0, stdout, stderr: "" });

describe("readZipMembers python candidates", () => {
  it("a first python that exits non-zero (the Windows Store stub) does not stop the second being tried", () => {
    const tried = [];
    const spawn = (exe) => {
      tried.push(exe);
      return exe === "python" ? { status: 9009, stdout: "", stderr: null } : ok('{"a":"text"}');
    };
    expect(readZipMembers("z.zip", ["a"], spawn, ["python", "py"])).toEqual({ a: "text" });
    expect(tried).toEqual(["python", "py"]);
  });

  it("an executable that cannot be spawned is skipped too", () => {
    const spawn = (exe) => (exe === "python3" ? { error: new Error("ENOENT") } : ok("{}"));
    expect(readZipMembers("z.zip", ["a"], spawn, ["python3", "python"])).toEqual({});
  });

  it("throws only after every candidate failed, naming each, with a null stderr handled", () => {
    const spawn = (exe) => (exe === "python" ? { status: 1, stdout: "", stderr: null } : { status: 2, stdout: "", stderr: "no such member\n" });
    expect(() => readZipMembers("z.zip", ["a"], spawn, ["python", "py"])).toThrow(/python: exit status 1; py: no such member/);
  });
});
