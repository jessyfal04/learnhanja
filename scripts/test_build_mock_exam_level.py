import unittest

from scripts.build_mock_exam_level import build_grade, exam_huneum, validate_paper


class BuildMockExamLevelTest(unittest.TestCase):
    def test_paper_contract_rejects_unknown_fields_and_invalid_sections(self):
        paper = {"source": "test", "sourceLabel": "test", "durationSeconds": 60, "sectionCounts": [["strokes", 1]], "scoring": {"pointsBySection": {"한자": 1}, "passingScore": 1}}
        validate_paper(paper)
        with self.assertRaisesRegex(ValueError, "invalid paper"):
            validate_paper({**paper, "passageTargets": []})
        with self.assertRaisesRegex(ValueError, "repeats a section"):
            validate_paper({**paper, "sectionCounts": [["strokes", 1], ["strokes", 2]]})
        with self.assertRaisesRegex(ValueError, "missing reading context"):
            validate_paper({**paper, "sectionCounts": [["passage", 2]]})

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

    def test_exam_huneum_removes_length_marks_and_separates_alternates(self):
        self.assertEqual(exam_huneum("긴 장(:)"), [("긴", "장")])
        self.assertEqual(exam_huneum("쇠 금/ 성 김"), [("쇠", "금"), ("성", "김")])
        self.assertEqual(exam_huneum("회복할복/ 다시부"), [("회복할", "복"), ("다시", "부")])
        self.assertEqual(exam_huneum("장인 공(기술자)"), [("장인", "공")])

    def test_grade_six_excludes_variant_and_keeps_alternate_sound(self):
        levels = {"variants": {"豊": "豐"}, "groups": [{"level": "6급", "characters": ["金", "豐", "豊"]}]}
        insights = {"characters": {char: {"hun": "", "strokes": 1, "radical": "一"} for char in ["金", "豐", "豊"]}}
        paper = {"source": "test", "sourceLabel": "test", "durationSeconds": 60, "sectionCounts": [["characterMeaning", 1]], "scoring": {"pointsBySection": {"한자": 1}, "passingScore": 1}}
        grade = build_grade("6", levels, insights, paper, {"金": "쇠 금/ 성 김", "豐": "풍년 풍"})
        self.assertEqual([entry["hanja"] for entry in grade["characters"]], ["金", "豐"])
        self.assertEqual(grade["characters"][0]["meaning"], "쇠")
        self.assertEqual(grade["characters"][0]["sounds"], ["금", "김"])


if __name__ == "__main__":
    unittest.main()
