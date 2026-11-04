import { describe, expect, it } from "vitest";
import files from "../../../pipeline/ritsu_special_files.json";
import { KITS } from "./kits";

// 課金衣装の一覧（R2 の中身。docs/setup.md）：kits.ts に書いた動きが、上げ忘れで出ないことがないように
describe("課金衣装の一覧", () => {
  it("固有モーションの動画がすべて R2 にある", () => {
    const list = files as Record<string, Record<string, string>>;
    for (const [id, kit] of Object.entries(KITS)) {
      for (const clip of kit.motions?.clips ?? []) {
        expect(list[id]?.[`motion-${clip.name}.mp4`], `${id} ${clip.name}`).toBeTruthy();
      }
    }
  });
});
