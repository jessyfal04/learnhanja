import unittest

from scripts.build_mock_exam_level import build_grade


class BuildMockExamLevelTest(unittest.TestCase):
    def test_grade_six_requires_anki_meaning_new(self):
        levels = {"groups": [{"level": "6급", "characters": ["右"]}]}
        insights = {"characters": {"右": {"hun": "오를/오른(쪽) 우:", "strokes": 5, "radical": "口"}}}
        paper = {"source": "test", "sourceLabel": "test", "durationSeconds": 60, "sectionCounts": [["characterMeaning", 1]], "scoring": {"pointsBySection": {"한자": 1}, "passingScore": 1}}
        with self.assertRaisesRegex(ValueError, "MeaningNew"):
            build_grade("6", levels, insights, paper)
        with self.assertRaisesRegex(ValueError, "MeaningNew"):
            build_grade("6", levels, insights, paper, {})
        grade = build_grade("6", levels, insights, paper, {"右": "오른쪽 우"})
        self.assertEqual(grade["characters"][0]["meaning"], "오른쪽")
        self.assertEqual(grade["characters"][0]["sound"], "우")


if __name__ == "__main__":
    unittest.main()
