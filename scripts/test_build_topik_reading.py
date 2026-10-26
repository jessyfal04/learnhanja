import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_topik_reading import read_paper


class ReadPaperTest(unittest.TestCase):
    def test_fragmented_choice_lines_and_shared_passage(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test_TOPIK_II_Reading_Listening_Migaku.epub"
            questions = []
            for number in range(1, 51):
                if number == 19:
                    questions.append('<p class="instruction">두 문제 공통</p><p class="text">새 지문</p>')
                choices = '<p class="choice">① 첫째</p><p class="choice">② 둘째</p><p class="choice">③ 셋째</p><p class="choice">④ 넷째</p>'
                if number == 13:
                    choices = '<p class="choice">① (</p><p class="text">가) ②(나)</p><p class="choice">③ (다) ④(라)</p>'
                questions.append(f'<h2 id="reading-q{number}">{number}.</h2><p class="text">문제</p>{choices}<p class="answer">✓ ②</p>')
            body = '<h1>읽기</h1><p class="instruction">다음을 읽으십시오.</p><p class="text">공통 지문</p>' + "".join(questions)
            with ZipFile(path, "w") as archive:
                archive.writestr("OEBPS/reading-01.xhtml", f'<html xmlns="http://www.w3.org/1999/xhtml"><body>{body}</body></html>')
            paper = read_paper(path)
            self.assertEqual(len(paper["questions"]), 50)
            self.assertEqual(paper["questions"][0]["shared"], ["공통 지문"])
            self.assertEqual(paper["questions"][12]["choices"], ["( 가)", "(나)", "(다)", "(라)"])
            self.assertEqual(paper["questions"][12]["answer"], 1)
            self.assertEqual(paper["questions"][18]["shared"], ["새 지문"])
            self.assertEqual(paper["questions"][19]["shared"], ["새 지문"])


if __name__ == "__main__":
    unittest.main()
