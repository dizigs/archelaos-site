#!/usr/bin/env python3
"""Offline archive-candidate regression tests. No real historical text modified."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location(
    "archelaos_archive_opportunities",
    Path(__file__).resolve().parents[1] / "tools" / "archive_opportunities.py"
)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test():
    assert mod.words("Νίκος Τσινόπουλος") == mod.words("ΝΙΚΟΣ ΤΣΙΝΟΠΟΥΛΟΣ")
    assert mod.words("Σταύρος") == mod.words("ΣΤΑΥΡΟΣ")
    assert "hidden" not in mod.visible_html("<p>Στίβος</p><script>hidden</script>")

    people = [
        {"id": "arch-one", "name": "Νίκος Τσινόπουλος"},
        {"id": "arch-two", "name": "Ιωάννης Δεληγιάννης"},
        {"id": "arch-three", "name": "Ιωάννης Δεληγιάννης"},
        {"id": "arch-four", "name": "Άννα Μαρία"}
    ]
    docs = [
        {"kind": "moment", "id": "1", "title": "Ιστορία",
         "content": "Ο ΝΙΚΟΣ ΤΣΙΝΟΠΟΥΛΟΣ συνέβαλε στο αρχείο."},
        {"kind": "story", "id": "1", "title": "Άλλο",
         "content": "Η λέξη Μικρονίκος Τσινόπουλος δεν πρέπει να ταιριάξει."},
        {"kind": "exhibit", "id": "a", "title": "Κείμενο",
         "content": "Ο Δεληγιάννης αναφέρεται με επώνυμο μόνο."},
        {"kind": "moment", "id": "2", "title": "Αμφίσημο",
         "content": "Ιωάννης Δεληγιάννης εμφανίζεται δύο φορές στη βάση."}
    ]
    found = mod.find_associations(people, docs)
    assert len(found["candidates"]) == 1, found["candidates"]
    assert found["candidates"][0]["references"] == [
        {"kind": "moment", "id": "1", "title": "Ιστορία"}
    ]
    assert len(found["ambiguous_full_names"]) == 1
    assert found["ambiguous_full_names"][0]["people_ids"] == ["arch-two", "arch-three"]
    assert "Άννα" not in [x["person_name"] for x in found["candidates"]]
    report = mod.build_report(people,
        [{"id": 1, "title": "Νίκος Τσινόπουλος", "year": "1975",
          "body": ["Διοικητική δραστηριότητα"], "source": "Πρακτικά"}],
        [{"title": "Αναδρομή", "lead": "", "text": "", "year": "1994"}],
        {"articles": [{"id": "intro", "title": "Αρχείο", "html": "<p>Στίβος</p>"}],
         "press": []},
        {"events": [{"day": "04-29", "momentId": 1}]}
    )
    assert report["counts"]["candidate_person_to_document_links"] == 1
    assert report["counts"]["curated_exact_day_events"] == 1
    assert report["moment_decades"] == {"1970s": 1}
    print("ARCHIVE CONNECTION TESTS OK: accent, boundaries, homonyms, museum HTML, calendar.")


if __name__ == "__main__":
    test()
