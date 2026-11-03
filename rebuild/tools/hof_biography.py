"""Lossless projection of canonical summaries onto independent archival profiles."""
from html import escape, unescape
import re


def correct_name(text: str) -> str:
    """Apply the established spelling without changing the preserved source files."""
    for old, new in (("Λυμπανοβνός", "Λιμπανοβνός"),
                     ("Λυμπανοβνό", "Λιμπανοβνό"),
                     ("Lympanovnos", "Limpanovnos")):
        text = text.replace(old, new)
    return text


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", correct_name(unescape(text))).strip()


def ensure_biography_sections(source: str, canonical_english: str) -> str:
    """Provide language sections on generated root-only profile pages.

    The original root HTML is not modified: its entire Greek biography is
    wrapped in place, with the escaped canonical English text in a hidden
    section. The archival source profiles already have both sections.
    """
    if 'data-profile-language=' in source:
        return source
    bio = re.search(r'<div class="bio">.*?</div>', source, flags=re.S)
    if not bio:
        raise ValueError("Unsectioned profile has no biography div")
    greek = ('<section class="profile-section" data-profile-language="el">'
             + bio.group(0) + '</section>')
    english = ('<section class="profile-section" lang="en" '
               'data-profile-language="en" hidden><h2>Biography</h2>'
               '<div class="bio">' + escape(correct_name(canonical_english))
               + '</div></section>')
    return source[:bio.start()] + greek + english + source[bio.end():]


def sync_biography(source: str, canonical: str, language: str) -> str:
    """Expand an exact/shorter summary, preserving independent archival facts.

    Being equal to a legacy index is not proof that its facts may be deleted.
    Only literal containment (after whitespace/entities and the approved spelling
    correction) permits replacement. Conflicting/richer prose stays untouched.
    """
    if language not in ("el", "en"):
        raise ValueError("Unsupported biography language")
    pattern = (r'(<section\b[^>]*data-profile-language="' + language
               + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')

    def expand(match):
        before = normalized(match.group(2))
        after = normalized(canonical)
        if not before or before == after or before not in after:
            return match.group(0)
        return match.group(1) + escape(correct_name(canonical)) + match.group(3)

    updated, matches = re.subn(pattern, expand, source, count=1, flags=re.S)
    if canonical.strip() and matches != 1:
        raise ValueError("Missing " + language + " biography section for nonempty canonical text")
    return correct_name(updated)
