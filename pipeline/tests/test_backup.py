"""控えの一覧（pipeline/backup_manifest.json）と、鍵を入れない決まりの確認"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backup


class BackupTest(unittest.TestCase):
    def test_parts_fit_in_wrangler_limit(self):
        listing = json.loads(backup.MANIFEST.read_text(encoding="utf-8"))
        self.assertTrue(listing["audio"])
        for p in [*listing["audio"], listing["home"]]:
            self.assertLess(p["size"], 315 * 1024 * 1024)
            self.assertEqual(len(p["sha256"]), 64)

    def test_secrets_are_not_included(self):
        self.assertFalse([p for p in backup.AUDIO if "secret" in p])
        self.assertNotIn(".secrets", Path(backup.__file__).read_text(encoding="utf-8").split('🔴 .secrets/ は入れない')[1])

    def test_memory_dir_follows_work_path(self):
        self.assertRegex(backup.memory_dir().parent.name, r"^[A-Za-z0-9-]+$")


if __name__ == "__main__":
    unittest.main()
